// database/seed.js
// Run with: npm run seed
//
// Before running this, make sure you've:
//   1. Created a Supabase project
//   2. Run database/schema.sql in the Supabase SQL Editor
//   3. Filled in SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//      and ADMIN_EMAIL / ADMIN_PASSWORD in your .env file
//
// This creates the first admin account directly in Supabase Auth (via the
// service-role "admin" API — this is the one place that API is meant for),
// plus sample categories, products, and testimonials so the site isn't
// empty on first run.

require('dotenv').config();
const slugify = require('slugify');
const { supabaseAdmin } = require('../config/supabase');

async function seed() {
  // ---- Admin user (Supabase Auth) ----
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@shereboytech.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe_123!';

  const { data: existingUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) throw new Error(`Failed to check existing users: ${listErr.message}`);

  const alreadyExists = existingUsers.users.some(u => u.email === adminEmail);

  if (!alreadyExists) {
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true, // skip email verification for the admin account
      user_metadata: { name: 'SHEREBOY Admin' }
    });
    if (createErr) throw new Error(`Failed to create admin user: ${createErr.message}`);
    console.log(`✅ Admin account created: ${adminEmail}`);
  } else {
    console.log('ℹ️  Admin account already exists — skipping.');
  }

  // ---- Categories ----
  const categoryData = [
    { name: 'Electronics', icon: '🎧', description: 'Gadgets, audio, and smart devices.' },
    { name: 'Home & Kitchen', icon: '🏠', description: 'Everyday essentials for the home.' },
    { name: 'Fashion', icon: '👗', description: 'Apparel, shoes, and accessories.' },
    { name: 'Beauty & Personal Care', icon: '💄', description: 'Skincare, haircare, and grooming.' },
    { name: 'Phones & Accessories', icon: '📱', description: 'Phones, cases, chargers, and more.' }
  ];

  const categoryIds = {};
  for (const c of categoryData) {
    const slug = slugify(c.name, { lower: true, strict: true });
    const { data: existing } = await supabaseAdmin.from('categories').select('id').eq('slug', slug).maybeSingle();
    if (existing) {
      categoryIds[c.name] = existing.id;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from('categories')
        .insert({ name: c.name, slug, icon: c.icon, description: c.description })
        .select('id')
        .single();
      if (error) throw new Error(`Failed to create category "${c.name}": ${error.message}`);
      categoryIds[c.name] = inserted.id;
    }
  }
  console.log(`✅ Categories ready (${categoryData.length})`);

  // ---- Sample products (only if none exist yet) ----
  const { count: existingCount, error: countErr } = await supabaseAdmin
    .from('products')
    .select('*', { count: 'exact', head: true });
  if (countErr) throw new Error(`Failed to count products: ${countErr.message}`);

  if (!existingCount) {
    const sampleProducts = [
      {
        name: 'Wireless Noise-Cancelling Headphones',
        description: 'Over-ear Bluetooth headphones with active noise cancellation and 30-hour battery life. Great for commuting, calls, and travel.',
        specifications: { 'Battery Life': '30 hours', 'Connectivity': 'Bluetooth 5.3', 'Weight': '250g' },
        price: 45000,
        discount_percent: 15,
        category: 'Electronics',
        affiliate_link: 'https://example.com/affiliate/headphones',
        is_featured: true,
        is_deal: true
      },
      {
        name: 'Smart Fitness Watch',
        description: 'Track heart rate, sleep, workouts, and notifications from your wrist. Water-resistant and long battery life.',
        specifications: { 'Display': '1.4" AMOLED', 'Water Resistance': '5 ATM', 'Battery': '7 days' },
        price: 32000,
        discount_percent: 10,
        category: 'Electronics',
        affiliate_link: 'https://example.com/affiliate/smartwatch',
        is_featured: true,
        is_deal: false
      },
      {
        name: '5-Piece Non-Stick Cookware Set',
        description: 'Durable non-stick pots and pans with heat-resistant handles, perfect for everyday cooking.',
        specifications: { 'Material': 'Aluminum, non-stick coating', 'Pieces': '5' },
        price: 28000,
        discount_percent: 0,
        category: 'Home & Kitchen',
        affiliate_link: 'https://example.com/affiliate/cookware',
        is_featured: false,
        is_deal: false
      },
      {
        name: 'Unisex Ankara Print Jacket',
        description: 'Stylish, breathable jacket with vibrant Ankara print detailing — a modern twist on a classic look.',
        specifications: { 'Material': 'Cotton blend', 'Fit': 'Regular' },
        price: 19500,
        discount_percent: 20,
        category: 'Fashion',
        affiliate_link: 'https://example.com/affiliate/ankara-jacket',
        is_featured: false,
        is_deal: true
      },
      {
        name: 'Vitamin C Brightening Serum',
        description: 'Lightweight facial serum formulated to even skin tone and boost radiance with daily use.',
        specifications: { 'Volume': '30ml', 'Skin Type': 'All skin types' },
        price: 12500,
        discount_percent: 5,
        category: 'Beauty & Personal Care',
        affiliate_link: 'https://example.com/affiliate/vitamin-c-serum',
        is_featured: true,
        is_deal: false
      },
      {
        name: 'Fast Wireless Charging Pad',
        description: '15W fast wireless charger compatible with most Qi-enabled phones. Compact and travel-friendly.',
        specifications: { 'Output': '15W max', 'Compatibility': 'Qi-enabled devices' },
        price: 9800,
        discount_percent: 12,
        category: 'Phones & Accessories',
        affiliate_link: 'https://example.com/affiliate/wireless-charger',
        is_featured: false,
        is_deal: true
      }
    ];

    for (const p of sampleProducts) {
      const slug = slugify(`${p.name}-${Date.now()}-${Math.floor(Math.random() * 1000)}`, { lower: true, strict: true });
      const { category, ...rest } = p;
      const { error } = await supabaseAdmin.from('products').insert({
        ...rest,
        slug,
        category_id: categoryIds[category] || null,
        availability: 'in_stock',
        images: []
      });
      if (error) throw new Error(`Failed to create product "${p.name}": ${error.message}`);
    }
    console.log(`✅ Sample products created (${sampleProducts.length})`);
  } else {
    console.log('ℹ️  Products already exist — skipping sample data.');
  }

  // ---- Testimonials ----
  const { count: testimonialCount, error: testErr } = await supabaseAdmin
    .from('testimonials')
    .select('*', { count: 'exact', head: true });
  if (testErr) throw new Error(`Failed to count testimonials: ${testErr.message}`);

  if (!testimonialCount) {
    const testimonials = [
      { customer_name: 'Amaka O.', quote: 'Found a great headphone deal here that I couldn\'t find anywhere else. Delivery was smooth too.', rating: 5 },
      { customer_name: 'Tunde A.', quote: 'The product descriptions are honest and detailed — no surprises when the item arrived.', rating: 5 },
      { customer_name: 'Blessing E.', quote: 'I use the AI assistant to compare products before buying. Saves me so much time.', rating: 4 }
    ];
    const { error } = await supabaseAdmin.from('testimonials').insert(testimonials);
    if (error) throw new Error(`Failed to create testimonials: ${error.message}`);
    console.log(`✅ Testimonials created (${testimonials.length})`);
  }

  console.log('\n🎉 Seeding complete!\n');
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
