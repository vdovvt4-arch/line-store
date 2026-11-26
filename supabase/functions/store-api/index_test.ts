import { handler } from "./index.ts";

const envKeys = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PASSWORD",
];
const testEnv: Record<string, string> = {
  SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: "test-service-role-key" }),
  ADMIN_PASSWORD: "test-admin-password",
};

async function withRuntime(
  mockFetch: typeof fetch,
  callback: () => Promise<void>,
): Promise<void> {
  const previousEnv = new Map(envKeys.map((key) => [key, Deno.env.get(key)]));
  const originalFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(testEnv)) Deno.env.set(key, value);
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  globalThis.fetch = mockFetch;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previousEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(
    `https://test-project.supabase.co/functions/v1/store-api${path}`,
    {
      ...init,
      headers: {
        Origin: "https://vdovvt4-arch.github.io",
        ...(init.headers || {}),
      },
    },
  );
}

Deno.test("public store filters out private product fields and CORS rejects other origins", async () => {
  let productSelect = "";
  await withRuntime(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/rest/v1/settings")) {
      return jsonResponse([{ key: "store", value: { hide_sold_out: true } }]);
    }
    if (url.pathname.endsWith("/rest/v1/products")) {
      productSelect = url.searchParams.get("select") || "";
      return jsonResponse([
        {
          id: 1,
          name: "Available",
          price: 100,
          stock: 3,
          published: true,
          sold_out: false,
        },
        {
          id: 2,
          name: "Sold out",
          price: 200,
          stock: 0,
          published: true,
          sold_out: false,
        },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }, async () => {
    const response = await handler(request("/api/store"));
    const body = await response.json() as {
      products: Array<Record<string, unknown>>;
    };
    if (response.status !== 200) {
      throw new Error(`Unexpected status ${response.status}`);
    }
    if (body.products.length !== 1 || body.products[0].name !== "Available") {
      throw new Error("Public store did not apply sold-out filtering");
    }
    if (
      body.products[0].cost_price !== 0 || productSelect.includes("cost_price")
    ) {
      throw new Error("Public store exposed private cost data");
    }
  });

  const denied = await handler(
    new Request(
      "https://test-project.supabase.co/functions/v1/store-api/api/store",
      {
        headers: { Origin: "https://attacker.example" },
      },
    ),
  );
  if (denied.status !== 403) {
    throw new Error(`Expected blocked CORS origin, got ${denied.status}`);
  }
});

Deno.test("order endpoint validates server-side pricing and calls the transactional RPC", async () => {
  let rpcBody: Record<string, unknown> | null = null;
  await withRuntime(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/rest/v1/settings")) {
      return jsonResponse([{
        key: "store",
        value: { delivery: { بغداد: 5000 } },
      }]);
    }
    if (url.pathname.endsWith("/rest/v1/products")) {
      return jsonResponse([{
        id: 7,
        name: "Test shirt",
        price: 1000,
        cost_price: 400,
        discount_type: "none",
        discount_value: 0,
        stock: 5,
        colors: [],
        sizes: [],
        published: true,
        sold_out: false,
      }]);
    }
    if (url.pathname.endsWith("/rest/v1/rpc/place_order")) {
      rpcBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse(42);
    }
    throw new Error(`Unexpected request: ${url}`);
  }, async () => {
    const response = await handler(request("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.0.2.11",
      },
      body: JSON.stringify({
        phone: "07123456789",
        name: "Test Buyer",
        governorate: "بغداد",
        address: "Test address",
        items: [{ product_id: 7, qty: 1 }],
      }),
    }));
    const body = await response.json() as { id: number; total: number };
    if (response.status !== 201 || body.id !== 42 || body.total !== 6000) {
      throw new Error(`Unexpected order response: ${JSON.stringify(body)}`);
    }
    const order = rpcBody?.p_order as Record<string, unknown> | undefined;
    if (order?.profit !== 600 || order?.total !== 6000) {
      throw new Error("Order RPC did not receive server-calculated totals");
    }
  });
});

Deno.test("admin login, product CRUD authorization, and logout use persisted sessions", async () => {
  let sessionActive = false;
  await withRuntime(async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    if (
      url.pathname.endsWith("/rest/v1/admin_sessions") &&
      init?.method === "DELETE"
    ) {
      if (url.searchParams.has("token_hash")) sessionActive = false;
      return jsonResponse([]);
    }
    if (
      url.pathname.endsWith("/rest/v1/admin_sessions") &&
      init?.method === "POST"
    ) {
      sessionActive = true;
      return jsonResponse([JSON.parse(String(init.body))]);
    }
    if (
      url.pathname.endsWith("/rest/v1/admin_sessions") && init?.method === "GET"
    ) {
      return jsonResponse(sessionActive ? [{ token_hash: "stored-hash" }] : []);
    }
    if (url.pathname.endsWith("/rest/v1/products") && init?.method === "POST") {
      const product = JSON.parse(String(init.body)) as Record<string, unknown>;
      return jsonResponse([{
        ...product,
        id: 21,
        created_at: "2026-01-01T00:00:00Z",
      }]);
    }
    if (headers.get("apikey") !== "test-service-role-key") {
      throw new Error("Backend call did not use the server-only service key");
    }
    return jsonResponse([]);
  }, async () => {
    const loginResponse = await handler(request("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.0.2.12",
      },
      body: JSON.stringify({ password: "test-admin-password" }),
    }));
    const loginBody = await loginResponse.json() as { token: string };
    if (
      loginResponse.status !== 200 || !/^[a-f0-9]{48}$/.test(loginBody.token)
    ) {
      throw new Error("Admin login did not issue an opaque session token");
    }
    if (JSON.stringify(loginBody).includes("test-service-role-key")) {
      throw new Error("Service key appeared in an API response");
    }

    const productResponse = await handler(request("/api/admin/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginBody.token}`,
      },
      body: JSON.stringify({ name: "Test product", price: 100, images: [] }),
    }));
    const product = await productResponse.json() as { id: number };
    if (productResponse.status !== 201 || product.id !== 21) {
      throw new Error(`Product create failed: ${productResponse.status}`);
    }

    const logout = await handler(request("/api/admin/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${loginBody.token}` },
    }));
    if (logout.status !== 200 || sessionActive) {
      throw new Error("Logout did not revoke the persisted session");
    }
    const denied = await handler(request("/api/admin/bootstrap", {
      headers: { Authorization: `Bearer ${loginBody.token}` },
    }));
    if (denied.status !== 401) {
      throw new Error("Revoked session remained authorized");
    }
  });
});

Deno.test("media upload validates image bytes and keeps the service key server-side", async () => {
  let storageKey = "";
  let storagePath = "";
  await withRuntime(async (input, init) => {
    const url = new URL(String(input));
    if (
      url.pathname.endsWith("/rest/v1/admin_sessions") &&
      init?.method === "DELETE"
    ) return jsonResponse([]);
    if (
      url.pathname.endsWith("/rest/v1/admin_sessions") &&
      init?.method === "POST"
    ) {
      return jsonResponse([JSON.parse(String(init.body))]);
    }
    if (
      url.pathname.endsWith("/rest/v1/admin_sessions") &&
      init?.method === "GET"
    ) return jsonResponse([{ token_hash: "stored-hash" }]);
    if (url.pathname.includes("/storage/v1/object/line-store-media/")) {
      storageKey = new Headers(init?.headers).get("apikey") || "";
      storagePath = url.pathname;
      return jsonResponse({});
    }
    throw new Error(`Unexpected request: ${url}`);
  }, async () => {
    const loginResponse = await handler(request("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "192.0.2.13",
      },
      body: JSON.stringify({ password: "test-admin-password" }),
    }));
    const { token } = await loginResponse.json() as { token: string };
    const image = `data:image/jpeg;base64,${
      btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0x00))
    }`;
    const upload = await handler(request("/api/admin/media", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ folder: "products", image }),
    }));
    const body = await upload.json() as { url: string };
    if (
      upload.status !== 201 ||
      !body.url.includes("/storage/v1/object/public/line-store-media/products/")
    ) {
      throw new Error(`Image upload failed: ${upload.status}`);
    }
    if (
      storageKey !== "test-service-role-key" ||
      !storagePath.includes("/products/")
    ) {
      throw new Error(
        "Image did not upload using server credentials to the products folder",
      );
    }
    if (JSON.stringify(body).includes("test-service-role-key")) {
      throw new Error("Service key appeared in media response");
    }
  });
});
