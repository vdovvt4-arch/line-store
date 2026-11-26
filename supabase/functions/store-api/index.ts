const ALLOWED_ORIGIN = "https://vdovvt4-arch.github.io";
const MEDIA_BUCKET = "line-store-media";
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const PAGE_SIZE = 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const STARTED_AT = Date.now();
const MEASUREMENT_KEYS = ["chest", "waist", "length", "shoulder", "sleeve"];
const GOVERNORATES = [
  "بغداد",
  "البصرة",
  "نينوى",
  "أربيل",
  "السليمانية",
  "دهوك",
  "كركوك",
  "ديالى",
  "الأنبار",
  "بابل",
  "كربلاء",
  "النجف",
  "واسط",
  "صلاح الدين",
  "ذي قار",
  "المثنى",
  "القادسية",
  "ميسان",
];
const ORDER_STATUSES = [
  "new",
  "confirmed",
  "preparing",
  "shipping",
  "delivered",
  "cancelled",
];
const DEFAULT_DELIVERY = Object.fromEntries(
  GOVERNORATES.map((g) => [g, g === "كربلاء" ? 3000 : 5000]),
);
const DEFAULT_SETTINGS: Record<string, unknown> = {
  name: "أزياء لاين الرجالية",
  logo_text: "LINE",
  tagline: "أناقة الرجل العصري | جودة وتفاصيل مميزة",
  currency: "د.ع",
  phone: "07890277454",
  whatsapp: "07890277454",
  address: "كربلاء - حي الحسين - خدمي مستشفى الحجة",
  hours: "يومياً من 10 صباحاً إلى 10 مساءً",
  footer_note: "جميع الحقوق محفوظة لمتجر أزياء لاين الرجالية",
  announce: "تشكيلة الملابس الرجالية الجديدة ✨ استخدم كود LINE10 لخصم 10%",
  show_announce: true,
  hero_title: "تشكيلة الموسم للرجال",
  hero_subtitle: "بدلات رسمية، قمصان، بنطلونات، وتيشيرتات مختارة بعناية",
  show_hero: true,
  show_slider: true,
  slides: [
    {
      title: "عروض البدلات الرسمية",
      subtitle: "خصم 15% لفترة محدودة على أحدث القصات التركية",
      badge: "خصم 15%",
      image: "",
    },
    {
      title: "تشكيلة الصيف الرجالية",
      subtitle: "قمصان كتان وتيشيرتات بولو بألوان عصرية",
      badge: "وصل حديثاً",
      image: "",
    },
    {
      title: "توصيل سريع لجميع المحافظات",
      subtitle: "استخدم كود LINE10 واحصل على خصم إضافي 10%",
      badge: "كود: LINE10",
      image: "",
    },
  ],
  default_theme: "dark",
  accent_1: "#d4af37",
  accent_2: "#1f6feb",
  card_radius: 18,
  grid_cols: "auto",
  show_size_chart: true,
  show_stock: true,
  hide_sold_out: false,
  enable_cart: true,
  enable_track: true,
  free_delivery_over: 0,
  min_order_amount: 0,
  instagram: "https://www.instagram.com/l600.n",
  tiktok: "https://www.tiktok.com/@linebrand",
  delivery: DEFAULT_DELIVERY,
};

type JsonObject = Record<string, unknown>;
type Query = Record<string, string | number | boolean | null | undefined>;

class AppError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const rateLimitHits = new Map<string, number[]>();

function env(name: string): string {
  return Deno.env.get(name) || "";
}

function serviceKey(): string {
  const legacyKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  try {
    const keys = JSON.parse(env("SUPABASE_SECRET_KEYS")) as Record<
      string,
      unknown
    >;
    const defaultKey = keys.default ?? keys.service_role;
    return typeof defaultKey === "string" ? defaultKey : "";
  } catch {
    return "";
  }
}

function projectUrl(): string {
  const value = env("SUPABASE_URL").replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+$/.test(value)) {
    throw new AppError(503, "إعدادات قاعدة البيانات غير مكتملة على الخادم");
  }
  return value;
}

function isConfigured(): boolean {
  try {
    return Boolean(projectUrl() && serviceKey() && env("ADMIN_PASSWORD"));
  } catch {
    return false;
  }
}

function credentials(): { url: string; key: string } {
  const url = projectUrl();
  const key = serviceKey();
  if (!key) {
    throw new AppError(503, "إعدادات قاعدة البيانات غير مكتملة على الخادم");
  }
  return { url, key };
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function supabaseRequest(
  path: string,
  options: {
    method?: string;
    query?: Query;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<{ data: unknown; response: Response }> {
  const { url, key } = credentials();
  const endpoint = new URL(`${url}${path}`);
  for (const [name, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== null) {
      endpoint.searchParams.set(name, String(value));
    }
  }

  const rawBody = options.body instanceof Uint8Array;
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(options.body === undefined || rawBody
      ? {}
      : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  const requestBody: BodyInit | undefined = options.body === undefined
    ? undefined
    : rawBody
    ? new Blob([Uint8Array.from(options.body as Uint8Array)])
    : JSON.stringify(options.body);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: options.method || "GET",
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody }),
    });
  } catch {
    throw new AppError(502, "تعذر الاتصال بخدمة قاعدة البيانات");
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const remoteCode = typeof data === "object" && data !== null
      ? String((data as JsonObject).code || "")
      : "";
    const status = response.status === 409
      ? 409
      : response.status >= 400 && response.status < 500
      ? 400
      : 502;
    const message = remoteCode === "23505"
      ? "السجل موجود مسبقاً"
      : "تعذر إكمال العملية في قاعدة البيانات";
    throw new AppError(status, message, remoteCode);
  }
  return { data, response };
}

async function selectRows(
  table: string,
  query: Query = {},
): Promise<JsonObject[]> {
  if (query.limit !== undefined) {
    const { data } = await supabaseRequest(`/rest/v1/${table}`, { query });
    if (!Array.isArray(data)) {
      throw new AppError(502, "استجابة غير صالحة من قاعدة البيانات");
    }
    return data as JsonObject[];
  }

  const rows: JsonObject[] = [];
  for (let offset = 0;; offset += PAGE_SIZE) {
    const { data } = await supabaseRequest(`/rest/v1/${table}`, {
      query: { select: "*", ...query, limit: PAGE_SIZE, offset },
    });
    if (!Array.isArray(data)) {
      throw new AppError(502, "استجابة غير صالحة من قاعدة البيانات");
    }
    rows.push(...data as JsonObject[]);
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function selectOne(
  table: string,
  query: Query = {},
): Promise<JsonObject | null> {
  return (await selectRows(table, { ...query, limit: 1 }))[0] || null;
}

async function insertOne(
  table: string,
  row: JsonObject,
  select = "*",
): Promise<JsonObject | null> {
  const { data } = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    query: { select },
    body: row,
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(data)
    ? (data[0] as JsonObject | undefined) || null
    : null;
}

async function upsertOne(
  table: string,
  row: JsonObject,
  conflictColumn: string,
  select = "*",
): Promise<JsonObject | null> {
  const { data } = await supabaseRequest(`/rest/v1/${table}`, {
    method: "POST",
    query: { on_conflict: conflictColumn, select },
    body: row,
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  return Array.isArray(data)
    ? (data[0] as JsonObject | undefined) || null
    : null;
}

async function updateOne(
  table: string,
  query: Query,
  patch: JsonObject,
): Promise<JsonObject | null> {
  const { data } = await supabaseRequest(`/rest/v1/${table}`, {
    method: "PATCH",
    query: { ...query, select: "*" },
    body: patch,
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(data)
    ? (data[0] as JsonObject | undefined) || null
    : null;
}

async function deleteRows(table: string, query: Query): Promise<number> {
  const { data } = await supabaseRequest(`/rest/v1/${table}`, {
    method: "DELETE",
    query,
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(data) ? data.length : 0;
}

async function rpc(name: string, args: JsonObject): Promise<unknown> {
  const { data } = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: args,
  });
  return data;
}

function finalPrice(product: JsonObject): number {
  const price = Number(product.price) || 0;
  const value = Number(product.discount_value) || 0;
  if (product.discount_type === "percent") {
    return Math.max(0, Math.round(price * (1 - Math.min(value, 100) / 100)));
  }
  if (product.discount_type === "fixed") return Math.max(0, price - value);
  return price;
}

function mapProduct(row: JsonObject | null): JsonObject | null {
  if (!row) return null;
  const sizes = parseArray(row.sizes).map((value) => {
    const size = asRecord(value);
    return {
      ...size,
      stock: size.stock !== undefined
        ? Math.max(0, Number(size.stock) || 0)
        : Math.max(0, Number(row.stock ?? 0)),
    };
  });
  const stock = sizes.length
    ? sizes.reduce((sum, size) => sum + Number(size.stock || 0), 0)
    : Math.max(0, Number(row.stock ?? 0));
  const low = Math.max(0, Number(row.low_stock_threshold ?? 3));
  const soldOut = Boolean(row.sold_out) || stock <= 0;
  const price = finalPrice(row);
  const costPrice = Math.max(0, Number(row.cost_price ?? 0));
  return {
    ...row,
    cost_price: costPrice,
    stock,
    low_stock_threshold: low,
    published: Boolean(row.published),
    sold_out: soldOut,
    available: !soldOut,
    low_stock: !soldOut && stock <= low,
    colors: parseArray(row.colors),
    sizes,
    images: parseArray(row.images),
    final_price: price,
    unit_profit: price - costPrice,
  };
}

const PUBLIC_PRODUCT_COLUMNS =
  "id,name,category,description,price,discount_type,discount_value,stock,low_stock_threshold,colors,sizes,images,published,sold_out,created_at";

async function findPublishedProducts(): Promise<JsonObject[]> {
  const rows = await selectRows("products", {
    select: PUBLIC_PRODUCT_COLUMNS,
    published: "eq.true",
    order: "id.desc",
  });
  return rows.map((row) => mapProduct(row) as JsonObject);
}

async function findAllProducts(): Promise<JsonObject[]> {
  return (await selectRows("products", { order: "id.desc" }))
    .map((row) => mapProduct(row) as JsonObject);
}

async function findProductById(
  id: number,
  published = false,
): Promise<JsonObject | null> {
  return mapProduct(
    await selectOne("products", {
      id: `eq.${id}`,
      ...(published ? { published: "eq.true" } : {}),
    }),
  );
}

function normPhone(value: unknown): string | null {
  let phone = String(value || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s-]/g, "");
  phone = phone.replace(/^\+?964/, "0");
  return /^07\d{9}$/.test(phone) ? phone : null;
}

function cleanSizes(value: unknown): JsonObject[] {
  return (Array.isArray(value) ? value : [])
    .filter((size) => String(asRecord(size).size || "").trim())
    .slice(0, 30)
    .map((value) => {
      const size = asRecord(value);
      return {
        ...Object.fromEntries(["size", ...MEASUREMENT_KEYS].map((key) => [
          key,
          String(size[key] || "").trim().slice(0, 30),
        ])),
        stock: Math.max(0, Number.parseInt(String(size.stock ?? 5), 10) || 0),
      };
    });
}

function mediaUrlIsValid(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const project = new URL(projectUrl());
    const media = new URL(value);
    const prefix = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
    const parts = media.pathname.slice(prefix.length).split("/");
    return media.origin === project.origin &&
      media.protocol === "https:" &&
      !media.username &&
      !media.password &&
      media.pathname.startsWith(prefix) &&
      ["products", "promos"].includes(decodeURIComponent(parts[0] || "")) &&
      parts.length === 2 &&
      !media.search &&
      !media.hash;
  } catch {
    return false;
  }
}

function cleanProduct(body: JsonObject): JsonObject {
  const colors = (Array.isArray(body.colors) ? body.colors : [])
    .map((color) => String(color).trim())
    .filter(Boolean)
    .slice(0, 20);
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter(mediaUrlIsValid)
    .slice(0, 6);
  const sizes = cleanSizes(body.sizes);
  const stock = sizes.length
    ? sizes.reduce((sum, size) => sum + Number(size.stock || 0), 0)
    : Math.max(0, Number.parseInt(String(body.stock ?? 10), 10) || 0);
  const lowStock = Math.max(
    0,
    Number.parseInt(String(body.low_stock_threshold ?? 3), 10) || 0,
  );
  return {
    name: String(body.name || "").trim().slice(0, 150),
    category: String(body.category || "").trim().slice(0, 60),
    description: String(body.description || "").trim().slice(0, 2000),
    price: Math.max(0, Number(body.price) || 0),
    cost_price: Math.max(0, Number(body.cost_price) || 0),
    discount_type: ["percent", "fixed"].includes(String(body.discount_type))
      ? body.discount_type
      : "none",
    discount_value: Math.max(0, Number(body.discount_value) || 0),
    stock,
    low_stock_threshold: lowStock,
    colors,
    sizes,
    images,
    published: Boolean(body.published),
    sold_out: Boolean(body.sold_out) || stock <= 0,
  };
}

async function findCustomerByPhone(phone: string): Promise<JsonObject | null> {
  return selectOne("customers", {
    select: "phone,name,governorate,address",
    phone: `eq.${phone}`,
  });
}

async function findOrdersByPhone(phone: string): Promise<JsonObject[]> {
  const rows = await selectRows("orders", {
    select:
      "id,product_id,product_name,size,color,items,governorate,coupon_code,discount_amount,price,delivery_fee,total,status,created_at",
    phone: `eq.${phone}`,
    order: "id.desc",
    limit: 20,
  });
  return rows.map(mapOrder);
}

function mapOrder(row: JsonObject): JsonObject {
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    ...row,
    cost_total: Number(row.cost_total || 0),
    profit: Number(row.profit || 0),
    measurements: row.measurements && typeof row.measurements === "object"
      ? row.measurements
      : {},
    items: items.length ? items : [{
      product_id: row.product_id,
      product_name: row.product_name,
      size: row.size,
      color: row.color,
      qty: 1,
      price: row.price,
      cost_price: 0,
    }],
  };
}

async function findCouponByCode(code: unknown): Promise<JsonObject | null> {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  return selectOne("coupons", {
    select: "id,code,type,value,min_order,active",
    code: `eq.${normalized}`,
    active: "eq.true",
  });
}

function calculateDiscount(
  coupon: JsonObject | null,
  subtotal: number,
): number {
  if (!coupon || !coupon.active) return 0;
  if (subtotal < Number(coupon.min_order || 0)) return 0;
  const value = Number(coupon.value || 0);
  if (coupon.type === "percent") {
    return Math.min(
      subtotal,
      Math.round(subtotal * (Math.min(value, 100) / 100)),
    );
  }
  if (coupon.type === "fixed") return Math.min(subtotal, Math.max(0, value));
  return 0;
}

async function getSettings(): Promise<JsonObject> {
  const row = await selectOne("settings", { key: "eq.store" });
  const parsed = row && row.value && typeof row.value === "object"
    ? asRecord(row.value)
    : null;
  if (!parsed) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    delivery: {
      ...(DEFAULT_SETTINGS.delivery as JsonObject),
      ...asRecord(parsed.delivery),
    },
  };
}

function cleanSlides(value: unknown): JsonObject[] | null {
  if (!Array.isArray(value)) return null;
  return value.slice(0, 8).map((item) => {
    const slide = asRecord(item);
    return {
      title: String(slide.title || "").trim().slice(0, 100),
      subtitle: String(slide.subtitle || "").trim().slice(0, 200),
      badge: String(slide.badge || "").trim().slice(0, 40),
      image: mediaUrlIsValid(slide.image) ? slide.image : "",
    };
  }).filter((slide) => slide.title || slide.subtitle || slide.image);
}

function cleanColor(value: unknown, fallback: unknown): string {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim())
    ? String(value).trim()
    : String(fallback);
}

async function updateSettings(body: JsonObject): Promise<JsonObject> {
  const current = await getSettings();
  const delivery = { ...asRecord(current.delivery) };
  if (body.delivery && typeof body.delivery === "object") {
    const requestedDelivery = asRecord(body.delivery);
    for (const governorate of GOVERNORATES) {
      if (governorate in requestedDelivery) {
        delivery[governorate] = Math.max(
          0,
          Number(requestedDelivery[governorate]) || 0,
        );
      }
    }
  }
  const slides = cleanSlides(body.slides);
  const next: JsonObject = {
    name: String(body.name ?? current.name).trim().slice(0, 80) ||
      String(DEFAULT_SETTINGS.name),
    logo_text:
      String(body.logo_text ?? current.logo_text).trim().slice(0, 12) ||
      String(DEFAULT_SETTINGS.logo_text),
    tagline: String(body.tagline ?? current.tagline).trim().slice(0, 120),
    currency: String(body.currency ?? current.currency).trim().slice(0, 15) ||
      String(DEFAULT_SETTINGS.currency),
    phone: String(body.phone ?? current.phone).trim().slice(0, 30),
    whatsapp: String(body.whatsapp ?? current.whatsapp).trim().slice(0, 30),
    address: String(body.address ?? current.address).trim().slice(0, 200),
    hours: String(body.hours ?? current.hours).trim().slice(0, 120),
    footer_note: String(body.footer_note ?? current.footer_note).trim().slice(
      0,
      200,
    ),
    announce: String(body.announce ?? current.announce).trim().slice(0, 200),
    show_announce: body.show_announce !== undefined
      ? Boolean(body.show_announce)
      : current.show_announce,
    hero_title: String(body.hero_title ?? current.hero_title).trim().slice(
      0,
      100,
    ),
    hero_subtitle: String(body.hero_subtitle ?? current.hero_subtitle).trim()
      .slice(0, 200),
    show_hero: body.show_hero !== undefined
      ? Boolean(body.show_hero)
      : current.show_hero,
    show_slider: body.show_slider !== undefined
      ? Boolean(body.show_slider)
      : current.show_slider,
    slides: slides ?? current.slides ?? [],
    default_theme: ["dark", "light"].includes(String(body.default_theme))
      ? body.default_theme
      : current.default_theme,
    accent_1: cleanColor(body.accent_1, current.accent_1),
    accent_2: cleanColor(body.accent_2, current.accent_2),
    card_radius: [8, 18, 28].includes(Number(body.card_radius))
      ? Number(body.card_radius)
      : current.card_radius,
    grid_cols: ["auto", "2", "3", "4"].includes(String(body.grid_cols))
      ? String(body.grid_cols)
      : current.grid_cols,
    show_size_chart: body.show_size_chart !== undefined
      ? Boolean(body.show_size_chart)
      : current.show_size_chart,
    show_stock: body.show_stock !== undefined
      ? Boolean(body.show_stock)
      : current.show_stock,
    hide_sold_out: body.hide_sold_out !== undefined
      ? Boolean(body.hide_sold_out)
      : current.hide_sold_out,
    enable_cart: body.enable_cart !== undefined
      ? Boolean(body.enable_cart)
      : current.enable_cart,
    enable_track: body.enable_track !== undefined
      ? Boolean(body.enable_track)
      : current.enable_track,
    free_delivery_over: Math.max(
      0,
      Number(body.free_delivery_over ?? current.free_delivery_over) || 0,
    ),
    min_order_amount: Math.max(
      0,
      Number(body.min_order_amount ?? current.min_order_amount) || 0,
    ),
    instagram: String(body.instagram ?? current.instagram).trim().slice(0, 200),
    tiktok: String(body.tiktok ?? current.tiktok).trim().slice(0, 200),
    delivery,
  };
  await upsertOne("settings", { key: "store", value: next }, "key");
  return next;
}

function rateLimit(
  request: Request,
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const ip = request.headers.get("x-forwarded-for") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const mapKey = `${key}:${ip.split(",")[0].trim()}`;
  const now = Date.now();
  const recent = (rateLimitHits.get(mapKey) || []).filter((timestamp) =>
    now - timestamp < windowMs
  );
  recent.push(now);
  rateLimitHits.set(mapKey, recent);
  if (rateLimitHits.size > 5000) {
    for (const [entryKey, timestamps] of rateLimitHits) {
      if (!timestamps.some((timestamp) => now - timestamp < windowMs)) {
        rateLimitHits.delete(entryKey);
      }
    }
  }
  return recent.length <= max;
}

async function readBody(request: Request): Promise<JsonObject> {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new AppError(413, "حجم البيانات كبير جداً");
  }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AppError(413, "حجم البيانات كبير جداً");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) return {};
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new AppError(400, "صيغة JSON غير صالحة");
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "صيغة JSON غير صالحة");
  }
}

function extractToken(request: Request): string {
  return (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
    .trim();
}

function timingSafeEqual(expected: string, actual: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const actualBytes = encoder.encode(actual);
  if (expectedBytes.length !== actualBytes.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    mismatch |= expectedBytes[i] ^ actualBytes[i];
  }
  return mismatch === 0;
}

async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function createSession(password: unknown): Promise<string> {
  const expected = env("ADMIN_PASSWORD");
  if (!expected) {
    throw new AppError(503, "كلمة مرور الإدارة غير مُعدة على الخادم");
  }
  if (!timingSafeEqual(expected, String(password || ""))) {
    throw new AppError(401, "كلمة المرور غير صحيحة");
  }
  const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(
    tokenBytes,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const ttl = Number(env("SESSION_TTL_MS")) || SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const tokenHash = await hashToken(token);
  await deleteRows("admin_sessions", {
    expires_at: `lt.${new Date().toISOString()}`,
  });
  await insertOne("admin_sessions", {
    token_hash: tokenHash,
    expires_at: expiresAt,
  }, "token_hash");
  return token;
}

async function requireAdmin(request: Request): Promise<string> {
  const token = extractToken(request);
  if (!/^[a-f0-9]{48}$/.test(token)) {
    throw new AppError(401, "غير مصرح، سجّل الدخول أولاً");
  }
  const tokenHash = await hashToken(token);
  const session = await selectOne("admin_sessions", {
    select: "token_hash",
    token_hash: `eq.${tokenHash}`,
    expires_at: `gt.${new Date().toISOString()}`,
  });
  if (!session) throw new AppError(401, "غير مصرح، سجّل الدخول أولاً");
  return tokenHash;
}

function mediaPathFromUrl(value: unknown): string {
  if (!mediaUrlIsValid(value)) throw new AppError(400, "رابط صورة غير صالح");
  const media = new URL(value);
  const encoded = media.pathname.slice(
    `/storage/v1/object/public/${MEDIA_BUCKET}/`.length,
  );
  const parts = encoded.split("/").map((part) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      throw new AppError(400, "رابط صورة غير صالح");
    }
    if (
      !decoded || decoded === "." || decoded === ".." || /[\\/]/.test(decoded)
    ) {
      throw new AppError(400, "رابط صورة غير صالح");
    }
    return decoded;
  });
  if (!["products", "promos"].includes(parts[0]) || parts.length !== 2) {
    throw new AppError(400, "رابط صورة غير صالح");
  }
  return parts.join("/");
}

function hasExpectedSignature(contents: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return contents.length >= 3 && contents[0] === 0xff &&
      contents[1] === 0xd8 && contents[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return contents.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) =>
        contents[index] === value
      );
  }
  return mimeType === "image/webp" &&
    contents.length >= 12 &&
    new TextDecoder().decode(contents.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(contents.slice(8, 12)) === "WEBP";
}

async function uploadMedia(
  image: unknown,
  folder: unknown,
): Promise<JsonObject> {
  if (!["products", "promos"].includes(String(folder))) {
    throw new AppError(400, "مجلد الصور غير صالح");
  }
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      String(image || ""),
    );
  if (!match) throw new AppError(400, "صيغة الصورة غير مدعومة");
  const mimeType = match[1];
  const base64 = match[2];
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new AppError(400, "صيغة الصورة غير مدعومة");
  }
  const contents = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (!contents.length || contents.length > MAX_IMAGE_BYTES) {
    throw new AppError(413, "حجم الصورة يتجاوز الحد المسموح (4 ميغابايت)");
  }
  if (!hasExpectedSignature(contents, mimeType)) {
    throw new AppError(400, "محتوى الملف لا يطابق صيغة الصورة المعلنة");
  }
  const extension = mimeType === "image/jpeg"
    ? "jpg"
    : mimeType === "image/png"
    ? "png"
    : "webp";
  const objectPath = `${folder}/${crypto.randomUUID()}.${extension}`;
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  await supabaseRequest(`/storage/v1/object/${MEDIA_BUCKET}/${encodedPath}`, {
    method: "POST",
    body: contents,
    headers: { "Content-Type": mimeType, "x-upsert": "false" },
  });
  const origin = new URL(projectUrl()).origin;
  return {
    path: objectPath,
    url: `${origin}/storage/v1/object/public/${MEDIA_BUCKET}/${encodedPath}`,
  };
}

async function deleteMediaUrls(value: unknown): Promise<number> {
  if (!Array.isArray(value) || value.length > 50) {
    throw new AppError(400, "عدد روابط الصور غير صالح");
  }
  const paths = [...new Set(value.map(mediaPathFromUrl))];
  if (!paths.length) return 0;
  await supabaseRequest(`/storage/v1/object/${MEDIA_BUCKET}`, {
    method: "DELETE",
    body: { prefixes: paths },
  });
  return paths.length;
}

async function findAllOrders(): Promise<JsonObject[]> {
  return (await selectRows("orders", { order: "id.desc" })).map(mapOrder);
}

async function findCustomersWithStats(): Promise<JsonObject[]> {
  const [customers, orders] = await Promise.all([
    selectRows("customers", { order: "created_at.desc" }),
    selectRows("orders", { select: "phone,status,total" }),
  ]);
  const stats = new Map<
    string,
    { orders_count: number; total_spent: number }
  >();
  for (const order of orders) {
    const phone = String(order.phone || "");
    const current = stats.get(phone) || { orders_count: 0, total_spent: 0 };
    current.orders_count += 1;
    if (order.status !== "cancelled") {
      current.total_spent += Number(order.total) || 0;
    }
    stats.set(phone, current);
  }
  return customers.map((customer) => ({
    ...customer,
    ...(stats.get(String(customer.phone || "")) ||
      { orders_count: 0, total_spent: 0 }),
  }));
}

async function handlePublicRoute(
  request: Request,
  method: string,
  pathname: string,
  url: URL,
): Promise<Response | null> {
  if (method === "GET" && pathname === "/api/store") {
    const settings = await getSettings();
    let products = await findPublishedProducts();
    if (settings.hide_sold_out) {
      products = products.filter((product) => !product.sold_out);
    }
    return jsonResponse(200, { settings, products });
  }

  if (method === "GET" && pathname === "/api/customer") {
    const phone = normPhone(url.searchParams.get("phone"));
    if (!phone) return jsonResponse(200, { found: false });
    const customer = await findCustomerByPhone(phone);
    return jsonResponse(
      200,
      customer ? { found: true, ...customer } : { found: false },
    );
  }

  if (method === "GET" && pathname === "/api/orders/track") {
    const phone = normPhone(url.searchParams.get("phone"));
    if (!phone) throw new AppError(400, "أدخل رقم هاتف صحيح (07xxxxxxxxx)");
    return jsonResponse(200, { orders: await findOrdersByPhone(phone) });
  }

  if (method === "GET" && pathname === "/api/coupons/check") {
    const code = url.searchParams.get("code");
    const subtotal = Math.max(0, Number(url.searchParams.get("subtotal")) || 0);
    const coupon = await findCouponByCode(code);
    if (!coupon) {
      return jsonResponse(200, {
        valid: false,
        message: "كود الخصم غير صالح أو متوقف",
      });
    }
    if (subtotal < Number(coupon.min_order || 0)) {
      return jsonResponse(200, {
        valid: false,
        message: `الحد الأدنى لاستخدام الكود هو ${coupon.min_order}`,
      });
    }
    const discount = calculateDiscount(coupon, subtotal);
    return jsonResponse(200, {
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
      message: `تم تطبيق كود ${coupon.code}`,
    });
  }

  if (method === "POST" && pathname === "/api/orders") {
    const result = await createOrder(request, await readBody(request));
    return jsonResponse(201, result);
  }
  return null;
}

async function createOrder(
  request: Request,
  body: JsonObject,
): Promise<JsonObject> {
  if (!rateLimit(request, "order", 10, 600000)) {
    throw new AppError(429, "محاولات كثيرة، حاول بعد قليل");
  }
  const phone = normPhone(body.phone);
  if (!phone) {
    throw new AppError(400, "رقم الهاتف غير صحيح (مثال: 07xxxxxxxxx)");
  }
  const name = String(body.name || "").trim();
  if (name.length < 2) throw new AppError(400, "الرجاء كتابة الاسم");

  const settings = await getSettings();
  const delivery = asRecord(settings.delivery);
  const governorate = String(body.governorate || "");
  if (!(governorate in delivery)) throw new AppError(400, "اختر المحافظة");
  const address = String(body.address || "").trim();
  if (!address) throw new AppError(400, "الرجاء كتابة العنوان");

  const rawItems = Array.isArray(body.items) && body.items.length
    ? body.items.slice(0, 20)
    : [{
      product_id: body.product_id,
      size: body.size,
      color: body.color,
      qty: body.qty || 1,
    }];
  const verifiedItems: JsonObject[] = [];
  let subtotal = 0;
  let costTotal = 0;
  for (const rawItem of rawItems) {
    const item = asRecord(rawItem);
    const product = await findProductById(Number(item.product_id), true);
    if (!product) throw new AppError(404, "أحد المنتجات غير متوفر حالياً");
    if (product.sold_out || Number(product.stock) <= 0) {
      throw new AppError(400, `المنتج غير متوفر حالياً: ${product.name}`);
    }
    const qty = Math.min(
      20,
      Math.max(1, Number.parseInt(String(item.qty), 10) || 1),
    );
    const size = String(item.size || "");
    const sizes = Array.isArray(product.sizes)
      ? product.sizes.map(asRecord)
      : [];
    if (sizes.length) {
      const sizeObj = sizes.find((entry) => entry.size === size);
      if (!sizeObj) {
        throw new AppError(400, `اختر القياس للمنتج: ${product.name}`);
      }
      if (Number(sizeObj.stock) <= 0) {
        throw new AppError(
          400,
          `القياس (${size}) غير متوفر حالياً من: ${product.name}`,
        );
      }
      if (qty > Number(sizeObj.stock)) {
        throw new AppError(
          400,
          `الكمية المتوفرة للقياس (${size}) من "${product.name}" هي ${sizeObj.stock} فقط`,
        );
      }
    } else if (qty > Number(product.stock)) {
      throw new AppError(
        400,
        `الكمية المتوفرة من "${product.name}" هي ${product.stock} فقط`,
      );
    }
    const color = String(item.color || "");
    const colors = Array.isArray(product.colors) ? product.colors : [];
    if (colors.length && !colors.includes(color)) {
      throw new AppError(400, `اختر اللون للمنتج: ${product.name}`);
    }
    const price = Number(product.final_price) || 0;
    const costPrice = Number(product.cost_price) || 0;
    subtotal += price * qty;
    costTotal += costPrice * qty;
    verifiedItems.push({
      product_id: product.id,
      product_name: product.name,
      size,
      color,
      qty,
      price,
      cost_price: costPrice,
    });
  }

  const minOrder = Number(settings.min_order_amount) || 0;
  if (minOrder > 0 && subtotal < minOrder) {
    throw new AppError(
      400,
      `الحد الأدنى للطلب هو ${minOrder} ${settings.currency}`,
    );
  }
  let couponCode = "";
  let discountAmount = 0;
  let usedCouponId: number | null = null;
  if (body.coupon_code) {
    const coupon = await findCouponByCode(body.coupon_code);
    if (!coupon) throw new AppError(400, "كود الخصم غير صالح أو متوقف");
    if (subtotal < Number(coupon.min_order || 0)) {
      throw new AppError(
        400,
        `الحد الأدنى لاستخدام الكود هو ${coupon.min_order} ${settings.currency}`,
      );
    }
    couponCode = String(coupon.code);
    discountAmount = calculateDiscount(coupon, subtotal);
    usedCouponId = Number(coupon.id);
  }
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const profit = afterDiscount - costTotal;
  let deliveryFee = Number(delivery[governorate]) || 0;
  const freeDeliveryOver = Number(settings.free_delivery_over) || 0;
  if (freeDeliveryOver > 0 && afterDiscount >= freeDeliveryOver) {
    deliveryFee = 0;
  }
  const total = afterDiscount + deliveryFee;
  const first = verifiedItems[0];
  const summaryName = verifiedItems.length > 1
    ? `${first.product_name} (+${verifiedItems.length - 1} منتجات)`
    : String(first.product_name);
  const order = {
    product_id: first.product_id,
    product_name: summaryName,
    size: first.size,
    color: first.color,
    items: verifiedItems,
    customer_name: name,
    phone,
    governorate,
    address,
    measurements: {},
    sketch: "",
    note: String(body.note || "").trim().slice(0, 500),
    coupon_code: couponCode,
    discount_amount: discountAmount,
    price: subtotal,
    cost_total: costTotal,
    profit,
    delivery_fee: deliveryFee,
    total,
  };
  const id = Number(
    await rpc("place_order", {
      p_order: order,
      p_customer: { phone, name, governorate, address },
      p_items: verifiedItems.map((item) => ({
        product_id: item.product_id,
        size: item.size,
        qty: item.qty,
      })),
      p_coupon_id: usedCouponId,
    }),
  );
  return {
    id,
    price: subtotal,
    discount_amount: discountAmount,
    delivery_fee: deliveryFee,
    total,
    items: verifiedItems,
  };
}

async function handleAdminRoute(
  request: Request,
  method: string,
  pathname: string,
): Promise<Response | null> {
  if (method === "POST" && pathname === "/api/admin/login") {
    if (!rateLimit(request, "login", 10, 600000)) {
      throw new AppError(429, "محاولات دخول كثيرة، انتظر قليلاً");
    }
    return jsonResponse(200, {
      token: await createSession((await readBody(request)).password),
    });
  }
  if (!pathname.startsWith("/api/admin/")) return null;

  const tokenHash = await requireAdmin(request);
  if (method === "POST" && pathname === "/api/admin/logout") {
    await deleteRows("admin_sessions", { token_hash: `eq.${tokenHash}` });
    return jsonResponse(200, { ok: true });
  }
  if (method === "GET" && pathname === "/api/admin/bootstrap") {
    const [products, orders, customers, coupons, expenses, settings] =
      await Promise.all([
        findAllProducts(),
        findAllOrders(),
        findCustomersWithStats(),
        selectRows("coupons", { order: "id.desc" }),
        selectRows("expenses", { order: "expense_date.desc,id.desc" }),
        getSettings(),
      ]);
    return jsonResponse(200, {
      products,
      orders,
      customers,
      coupons,
      expenses,
      settings,
      governorates: GOVERNORATES,
    });
  }
  if (method === "POST" && pathname === "/api/admin/media") {
    const body = await readBody(request);
    return jsonResponse(201, await uploadMedia(body.image, body.folder));
  }
  if (method === "DELETE" && pathname === "/api/admin/media") {
    const body = await readBody(request);
    return jsonResponse(200, { deleted: await deleteMediaUrls(body.urls) });
  }
  if (method === "POST" && pathname === "/api/admin/products") {
    const product = cleanProduct(await readBody(request));
    if (!product.name) throw new AppError(400, "اسم المنتج مطلوب");
    return jsonResponse(201, mapProduct(await insertOne("products", product)));
  }

  const inventoryMatch = pathname.match(
    /^\/api\/admin\/products\/(\d+)\/inventory$/,
  );
  if (inventoryMatch && method === "PATCH") {
    const id = Number(inventoryMatch[1]);
    const body = await readBody(request);
    const current = await findProductById(id);
    if (!current) throw new AppError(404, "المنتج غير موجود");
    const stock = body.stock !== undefined
      ? Math.max(0, Number.parseInt(String(body.stock), 10) || 0)
      : Number(current.stock);
    const lowStock = body.low_stock_threshold !== undefined
      ? Math.max(0, Number.parseInt(String(body.low_stock_threshold), 10) || 0)
      : Number(current.low_stock_threshold);
    let soldOut = body.sold_out !== undefined
      ? Boolean(body.sold_out)
      : Boolean(current.sold_out);
    if (stock <= 0) soldOut = true;
    else if (
      body.stock !== undefined && body.sold_out === undefined &&
      Number(current.stock) === 0
    ) soldOut = false;
    const discountType = body.discount_type !== undefined
      ? (["percent", "fixed"].includes(String(body.discount_type))
        ? body.discount_type
        : "none")
      : current.discount_type;
    const discountValue = body.discount_value !== undefined
      ? Math.max(0, Number(body.discount_value) || 0)
      : current.discount_value;
    const updated = mapProduct(
      await updateOne("products", { id: `eq.${id}` }, {
        stock,
        low_stock_threshold: lowStock,
        sold_out: soldOut,
        discount_type: discountType,
        discount_value: discountValue,
      }),
    );
    if (!updated) throw new AppError(404, "المنتج غير موجود");
    return jsonResponse(200, updated);
  }

  const productMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (productMatch) {
    const id = Number(productMatch[1]);
    if (method === "PUT") {
      const product = cleanProduct(await readBody(request));
      if (!product.name) throw new AppError(400, "اسم المنتج مطلوب");
      const updated = mapProduct(
        await updateOne("products", { id: `eq.${id}` }, product),
      );
      if (!updated) throw new AppError(404, "المنتج غير موجود");
      return jsonResponse(200, updated);
    }
    if (method === "DELETE") {
      const product = await findProductById(id);
      if (product && Array.isArray(product.images)) {
        await deleteMediaUrls(product.images);
      }
      await deleteRows("products", { id: `eq.${id}` });
      return jsonResponse(200, { ok: true });
    }
  }

  const orderMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (orderMatch) {
    const id = Number(orderMatch[1]);
    if (method === "PATCH") {
      const status = String((await readBody(request)).status || "");
      if (!ORDER_STATUSES.includes(status)) {
        throw new AppError(400, "حالة غير صالحة");
      }
      if (!await updateOne("orders", { id: `eq.${id}` }, { status })) {
        throw new AppError(404, "الطلب غير موجود");
      }
      return jsonResponse(200, { ok: true, status });
    }
    if (method === "DELETE") {
      await deleteRows("orders", { id: `eq.${id}` });
      return jsonResponse(200, { ok: true });
    }
  }

  if (method === "POST" && pathname === "/api/admin/coupons") {
    const body = await readBody(request);
    if (!String(body.code || "").trim()) {
      throw new AppError(400, "كود الخصم مطلوب");
    }
    const normalized = String(body.code || "").trim().toUpperCase().slice(
      0,
      30,
    );
    try {
      const coupon = await insertOne("coupons", {
        code: normalized,
        type: ["percent", "fixed"].includes(String(body.type))
          ? body.type
          : "percent",
        value: Math.max(0, Number(body.value) || 0),
        min_order: Math.max(0, Number(body.min_order) || 0),
        active: Boolean(body.active),
      });
      return jsonResponse(201, coupon);
    } catch (error) {
      if (
        error instanceof AppError &&
        (error.code === "23505" || error.status === 409)
      ) {
        throw new AppError(400, "كود الخصم مستخدم مسبقاً");
      }
      throw error;
    }
  }
  const couponMatch = pathname.match(/^\/api\/admin\/coupons\/(\d+)$/);
  if (couponMatch) {
    const id = Number(couponMatch[1]);
    if (method === "PATCH") {
      const updated = await updateOne("coupons", { id: `eq.${id}` }, {
        active: Boolean((await readBody(request)).active),
      });
      if (!updated) throw new AppError(404, "كود الخصم غير موجود");
      return jsonResponse(200, updated);
    }
    if (method === "DELETE") {
      await deleteRows("coupons", { id: `eq.${id}` });
      return jsonResponse(200, { ok: true });
    }
  }
  if (method === "POST" && pathname === "/api/admin/expenses") {
    const body = await readBody(request);
    const title = String(body.title || "").trim().slice(0, 120);
    if (!title) throw new AppError(400, "وصف المصروف مطلوب");
    const categories = ["rent", "electricity", "salary", "marketing", "other"];
    const expenseDate =
      /^\d{4}-\d{2}-\d{2}$/.test(String(body.expense_date || ""))
        ? body.expense_date
        : new Date().toISOString().slice(0, 10);
    return jsonResponse(
      201,
      await insertOne("expenses", {
        title,
        category: categories.includes(String(body.category))
          ? body.category
          : "other",
        amount: Math.max(0, Number(body.amount) || 0),
        note: String(body.note || "").trim().slice(0, 300),
        expense_date: expenseDate,
      }),
    );
  }
  const expenseMatch = pathname.match(/^\/api\/admin\/expenses\/(\d+)$/);
  if (expenseMatch && method === "DELETE") {
    await deleteRows("expenses", { id: `eq.${Number(expenseMatch[1])}` });
    return jsonResponse(200, { ok: true });
  }
  if (method === "PUT" && pathname === "/api/admin/settings") {
    return jsonResponse(200, await updateSettings(await readBody(request)));
  }
  throw new AppError(404, "مسار غير موجود");
}

function jsonResponse(
  status: number,
  value: unknown,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function routePath(url: URL): string {
  const marker = "/functions/v1/store-api";
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex >= 0) {
    return url.pathname.slice(markerIndex + marker.length) || "/";
  }
  return url.pathname;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (!origin) return headers;
  if (origin !== ALLOWED_ORIGIN) {
    throw new AppError(403, "مصدر الواجهة غير مسموح له بالاتصال بالخادم");
  }
  headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Vary", "Origin");
  return headers;
}

export async function handler(request: Request): Promise<Response> {
  let cors = new Headers();
  try {
    cors = corsHeaders(request);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonResponse(error.status, { error: error.message });
    }
    return jsonResponse(500, { error: "حدث خطأ في الخادم" });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const url = new URL(request.url);
    const pathname = routePath(url);
    if (request.method === "GET" && pathname === "/api/health") {
      if (!isConfigured()) {
        return jsonResponse(503, {
          ok: false,
          error: "إعدادات قاعدة البيانات غير مكتملة على الخادم",
        }, cors);
      }
      try {
        await selectRows("products", { select: "id", limit: 1 });
        await selectRows("admin_sessions", { select: "token_hash", limit: 1 });
        return jsonResponse(200, {
          ok: true,
          uptime: Math.round((Date.now() - STARTED_AT) / 1000),
        }, cors);
      } catch {
        return jsonResponse(503, {
          ok: false,
          error: "تعذر الاتصال بقاعدة البيانات أو لم تُطبق migration بعد",
        }, cors);
      }
    }

    const publicResponse = await handlePublicRoute(
      request,
      request.method,
      pathname,
      url,
    );
    if (publicResponse) return copyHeaders(publicResponse, cors);
    const adminResponse = await handleAdminRoute(
      request,
      request.method,
      pathname,
    );
    if (adminResponse) return copyHeaders(adminResponse, cors);
    throw new AppError(request.method === "GET" ? 404 : 405, "مسار غير موجود");
  } catch (error) {
    if (error instanceof AppError) {
      return jsonResponse(error.status, { error: error.message }, cors);
    }
    console.error("[Store API error]", error);
    return jsonResponse(500, { error: "حدث خطأ في الخادم" }, cors);
  }
}

function copyHeaders(response: Response, extraHeaders: Headers): Response {
  const headers = new Headers(response.headers);
  extraHeaders.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

if (import.meta.main) Deno.serve(handler);
