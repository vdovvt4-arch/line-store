const db = require('../supabase');
const { DEFAULT_SETTINGS, GOVERNORATES } = require('../../config');
const { isProjectMediaUrl } = require('../storage');

function cleanColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim()) ? String(value).trim() : fallback;
}

function cleanSlides(slides) {
  if (!Array.isArray(slides)) return null;
  return slides.slice(0, 8).map(slide => ({
    title: String(slide?.title || '').trim().slice(0, 100),
    subtitle: String(slide?.subtitle || '').trim().slice(0, 200),
    badge: String(slide?.badge || '').trim().slice(0, 40),
    image: isProjectMediaUrl(slide?.image) ? slide.image : '',
  })).filter(slide => slide.title || slide.subtitle || slide.image);
}

async function get() {
  const row = await db.selectOne('settings', { key: 'eq.store' }, { role: 'anon' });
  const parsed = row && row.value && typeof row.value === 'object' ? row.value : null;
  if (!parsed) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    delivery: { ...DEFAULT_SETTINGS.delivery, ...(parsed.delivery || {}) },
  };
}

async function update(body) {
  const current = await get();
  const delivery = { ...current.delivery };
  if (body.delivery && typeof body.delivery === 'object') {
    for (const governorate of GOVERNORATES) {
      if (governorate in body.delivery) {
        delivery[governorate] = Math.max(0, Number(body.delivery[governorate]) || 0);
      }
    }
  }

  const next = {
    name: String(body.name ?? current.name).trim().slice(0, 80) || DEFAULT_SETTINGS.name,
    logo_text: String(body.logo_text ?? current.logo_text).trim().slice(0, 12) || DEFAULT_SETTINGS.logo_text,
    tagline: String(body.tagline ?? current.tagline).trim().slice(0, 120),
    currency: String(body.currency ?? current.currency).trim().slice(0, 15) || DEFAULT_SETTINGS.currency,
    phone: String(body.phone ?? current.phone).trim().slice(0, 30),
    whatsapp: String(body.whatsapp ?? current.whatsapp).trim().slice(0, 30),
    address: String(body.address ?? current.address).trim().slice(0, 200),
    hours: String(body.hours ?? current.hours).trim().slice(0, 120),
    footer_note: String(body.footer_note ?? current.footer_note).trim().slice(0, 200),
    announce: String(body.announce ?? current.announce).trim().slice(0, 200),
    show_announce: body.show_announce !== undefined ? Boolean(body.show_announce) : current.show_announce,
    hero_title: String(body.hero_title ?? current.hero_title).trim().slice(0, 100),
    hero_subtitle: String(body.hero_subtitle ?? current.hero_subtitle).trim().slice(0, 200),
    show_hero: body.show_hero !== undefined ? Boolean(body.show_hero) : current.show_hero,
    show_slider: body.show_slider !== undefined ? Boolean(body.show_slider) : current.show_slider,
    slides: cleanSlides(body.slides) ?? current.slides ?? [],
    default_theme: ['dark', 'light'].includes(body.default_theme) ? body.default_theme : current.default_theme,
    accent_1: cleanColor(body.accent_1, current.accent_1),
    accent_2: cleanColor(body.accent_2, current.accent_2),
    card_radius: [8, 18, 28].includes(Number(body.card_radius)) ? Number(body.card_radius) : current.card_radius,
    grid_cols: ['auto', '2', '3', '4'].includes(String(body.grid_cols)) ? String(body.grid_cols) : current.grid_cols,
    show_size_chart: body.show_size_chart !== undefined ? Boolean(body.show_size_chart) : current.show_size_chart,
    show_stock: body.show_stock !== undefined ? Boolean(body.show_stock) : current.show_stock,
    hide_sold_out: body.hide_sold_out !== undefined ? Boolean(body.hide_sold_out) : current.hide_sold_out,
    enable_cart: body.enable_cart !== undefined ? Boolean(body.enable_cart) : current.enable_cart,
    enable_track: body.enable_track !== undefined ? Boolean(body.enable_track) : current.enable_track,
    free_delivery_over: Math.max(0, Number(body.free_delivery_over ?? current.free_delivery_over) || 0),
    min_order_amount: Math.max(0, Number(body.min_order_amount ?? current.min_order_amount) || 0),
    instagram: String(body.instagram ?? current.instagram).trim().slice(0, 200),
    tiktok: String(body.tiktok ?? current.tiktok).trim().slice(0, 200),
    delivery,
  };
  await db.upsertOne('settings', { key: 'store', value: next }, 'key');
  return next;
}

module.exports = { get, update, cleanSlides };
