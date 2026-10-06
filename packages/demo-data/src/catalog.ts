import type { Banner, Category, Inventory, Product, Promotion, Sku } from '@aus/contracts';
import type { SeedCtx } from './types';

const DAY = 86_400_000;

interface SkuSpec {
  code: string; optionValues?: Record<string, string>; packSize?: string; priceCents: number;
  memberPriceCents?: number; sale?: { priceCents: number }; taxClass?: 'GST' | 'GST_FREE';
  openingStock: number; lowStockThreshold?: number;
}
interface ProductSpec {
  id: string; slug: string; name: string; brand?: string; glyph: string; hue: number;
  categories: string[]; description: string; specs: [string, string][];
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'; skus: SkuSpec[];
}

// NOTE: openingStock values are pre-order opening balances. Seed order flows in
// orders.ts replay holds/allocations/dispatches on top of these to reach the
// intended current state (low stock, final unit, etc.).
const productSpecs: ProductSpec[] = [
  { id: 'prod-apples', slug: 'fuji-apples-1kg', name: 'Fuji Apples', brand: 'Orchard Row', glyph: '🍎', hue: 0, categories: ['cat-produce'], description: 'Crisp, sweet Fuji apples grown in Victoria. Ideal for lunchboxes and baking.', specs: [['Origin', 'Shepparton, VIC'], ['Storage', 'Keep refrigerated']], skus: [{ code: 'APL-FUJ-1KG', packSize: '1kg bag', priceCents: 490, taxClass: 'GST_FREE', openingStock: 60 }] },
  { id: 'prod-bananas', slug: 'bananas-1kg', name: 'Bananas', brand: 'Orchard Row', glyph: '🍌', hue: 55, categories: ['cat-produce'], description: 'Sweet Cavendish bananas from Queensland, picked at ripeness.', specs: [['Origin', 'Innisfail, QLD'], ['Class', 'Class 1']], skus: [{ code: 'BAN-CAV-1KG', packSize: '1kg', priceCents: 320, taxClass: 'GST_FREE', openingStock: 80 }] },
  { id: 'prod-carrots', slug: 'carrots-1kg', name: 'Carrots', brand: 'Orchard Row', glyph: '🥕', hue: 25, categories: ['cat-produce'], description: 'Sweet, crunchy carrots — great roasted, grated or snacked raw.', specs: [['Origin', 'Gawler, SA']], skus: [{ code: 'CAR-1KG', packSize: '1kg', priceCents: 250, memberPriceCents: 220, taxClass: 'GST_FREE', openingStock: 45 }] },
  { id: 'prod-mangoes', slug: 'kensington-mangoes-1kg', name: 'Kensington Mangoes', brand: 'Orchard Row', glyph: '🥭', hue: 45, categories: ['cat-produce'], description: 'Seasonal Kensington Pride mangoes. Out of season right now — back next summer.', specs: [['Origin', 'Bowen, QLD']], skus: [{ code: 'MNG-KP-1KG', packSize: '1kg tray', priceCents: 890, taxClass: 'GST_FREE', openingStock: 0 }] },
  { id: 'prod-sourdough', slug: 'sourdough-loaf-680g', name: 'Sourdough Loaf', brand: 'Hearth & Crumb', glyph: '🍞', hue: 35, categories: ['cat-bakery'], description: 'Slow-fermented white sourdough with a blistered crust and open crumb.', specs: [['Weight', '680g'], ['Allergens', 'Contains wheat']], skus: [{ code: 'BRD-SRD-680', packSize: '680g loaf', priceCents: 750, taxClass: 'GST_FREE', openingStock: 20 }] },
  { id: 'prod-wholemeal', slug: 'wholemeal-bread-650g', name: 'Wholemeal Bread', brand: 'Hearth & Crumb', glyph: '🍞', hue: 28, categories: ['cat-bakery'], description: 'Soft wholemeal sandwich loaf, high in fibre. On special this week.', specs: [['Weight', '650g'], ['Allergens', 'Contains wheat']], skus: [{ code: 'BRD-WHL-650', packSize: '650g loaf', priceCents: 420, taxClass: 'GST_FREE', openingStock: 24, sale: { priceCents: 360 } }] },
  { id: 'prod-croissants', slug: 'butter-croissants-4pk', name: 'Butter Croissants', brand: 'Hearth & Crumb', glyph: '🥐', hue: 42, categories: ['cat-bakery'], description: 'All-butter laminated croissants, baked fresh each morning.', specs: [['Count', '4 per pack'], ['Allergens', 'Contains wheat, milk']], skus: [{ code: 'CRO-BTR-4PK', packSize: '4 pack', priceCents: 680, taxClass: 'GST_FREE', openingStock: 12 }] },
  { id: 'prod-milk', slug: 'whole-milk', name: 'Whole Milk', brand: 'Meadow Vale', glyph: '🥛', hue: 210, categories: ['cat-dairy'], description: 'Pasteurised whole milk from Victorian dairy farms, in three sizes.', specs: [['Fat', '3.5%'], ['Keep', 'Refrigerated at 4°C']], skus: [
    { code: 'MLK-WHM-1L', optionValues: { Size: '1L' }, packSize: '1L', priceCents: 260, taxClass: 'GST_FREE', openingStock: 90 },
    { code: 'MLK-WHM-2L', optionValues: { Size: '2L' }, packSize: '2L', priceCents: 340, taxClass: 'GST_FREE', openingStock: 70 },
    { code: 'MLK-WHM-3L', optionValues: { Size: '3L' }, packSize: '3L', priceCents: 450, taxClass: 'GST_FREE', openingStock: 40 },
  ] },
  { id: 'prod-yoghurt', slug: 'greek-yoghurt-1kg', name: 'Greek Yoghurt', brand: 'Meadow Vale', glyph: '🍶', hue: 195, categories: ['cat-dairy'], description: 'Thick, strained Greek-style yoghurt with no added sugar.', specs: [['Weight', '1kg'], ['Allergens', 'Contains milk']], skus: [{ code: 'YOG-GRK-1KG', packSize: '1kg tub', priceCents: 650, taxClass: 'GST_FREE', openingStock: 30 }] },
  { id: 'prod-eggs', slug: 'free-range-eggs-12pk', name: 'Free Range Eggs', brand: 'Sunny Acres', glyph: '🥚', hue: 48, categories: ['cat-dairy'], description: 'Large free-range eggs from hens with room to roam. Running low today.', specs: [['Count', '12 eggs'], ['Size', 'Large 600g']], skus: [{ code: 'EGG-FR-12PK', packSize: '12 pack', priceCents: 580, taxClass: 'GST_FREE', openingStock: 3, lowStockThreshold: 6 }] },
  { id: 'prod-cheddar', slug: 'tasty-cheddar-500g', name: 'Tasty Cheddar', brand: 'Highland Dairy', glyph: '🧀', hue: 45, categories: ['cat-dairy'], description: 'Aged 12 months for a full, nutty flavour. Members save $1.', specs: [['Weight', '500g'], ['Aging', '12 months']], skus: [{ code: 'CHD-TST-500', packSize: '500g block', priceCents: 890, memberPriceCents: 790, taxClass: 'GST_FREE', openingStock: 23 }] },
  { id: 'prod-rice', slug: 'basmati-rice', name: 'Basmati Rice', brand: 'Golden Fields', glyph: '🍚', hue: 40, categories: ['cat-pantry'], description: 'Aged basmati rice with long, separate grains. Two pack sizes.', specs: [['Type', 'Aged basmati'], ['Origin', 'Punjab']], skus: [
    { code: 'RIC-BAS-1KG', optionValues: { Size: '1kg' }, packSize: '1kg', priceCents: 490, taxClass: 'GST_FREE', openingStock: 55 },
    { code: 'RIC-BAS-5KG', optionValues: { Size: '5kg' }, packSize: '5kg', priceCents: 1690, taxClass: 'GST_FREE', openingStock: 20 },
  ] },
  { id: 'prod-oliveoil', slug: 'extra-virgin-olive-oil-750ml', name: 'Extra Virgin Olive Oil', brand: 'Grove & Co', glyph: '🫒', hue: 95, categories: ['cat-pantry'], description: 'Cold-pressed within 6 hours of harvest, with a peppery finish.', specs: [['Volume', '750ml'], ['Acidity', '0.3%']], skus: [{ code: 'OIL-EVO-750', packSize: '750ml', priceCents: 1850, taxClass: 'GST_FREE', openingStock: 26 }] },
  { id: 'prod-spaghetti', slug: 'spaghetti-500g', name: 'Spaghetti No. 5', brand: 'Casa Verde', glyph: '🍝', hue: 38, categories: ['cat-pantry'], description: 'Bronze-dried durum wheat spaghetti that holds sauce beautifully.', specs: [['Weight', '500g'], ['Cook time', '9 minutes']], skus: [{ code: 'PST-SPG-500', packSize: '500g', priceCents: 220, taxClass: 'GST_FREE', openingStock: 120 }] },
  { id: 'prod-oats', slug: 'rolled-oats-900g', name: 'Rolled Oats', brand: 'Golden Fields', glyph: '🥣', hue: 35, categories: ['cat-pantry'], description: 'Wholegrain rolled oats for porridge and baking.', specs: [['Weight', '900g'], ['Allergens', 'Contains gluten']], skus: [{ code: 'OAT-ROL-900', packSize: '900g', priceCents: 430, taxClass: 'GST_FREE', openingStock: 48 }] },
  { id: 'prod-honey', slug: 'raw-honey-500g', name: 'Raw Honey', brand: 'Bushway Apiary', glyph: '🍯', hue: 43, categories: ['cat-pantry'], description: 'Unheated, unfiltered stringybark honey from Gippsland.', specs: [['Weight', '500g'], ['Varietal', 'Stringybark']], skus: [{ code: 'HNY-RAW-500', packSize: '500g jar', priceCents: 980, taxClass: 'GST_FREE', openingStock: 18 }] },
  { id: 'prod-truffleoil', slug: 'truffle-oil-100ml', name: 'White Truffle Oil', brand: 'Grove & Co', glyph: '🛢️', hue: 50, categories: ['cat-pantry'], description: 'Limited seasonal import — only one bottle left in this demo. Two competing checkouts fight over it (scenario 3).', specs: [['Volume', '100ml'], ['Use', 'Finishing only']], skus: [{ code: 'OIL-TRF-100', packSize: '100ml', priceCents: 2490, taxClass: 'GST_FREE', openingStock: 1, lowStockThreshold: 2 }] },
  { id: 'prod-coffee', slug: 'arabica-coffee-beans', name: 'Arabica Coffee Beans', brand: 'First Light Roasters', glyph: '☕', hue: 18, categories: ['cat-beverages', 'cat-bev-coffee'], description: 'Single-origin Colombian beans, roasted weekly in Sydney. Two sizes.', specs: [['Origin', 'Huila, Colombia'], ['Roast', 'Medium']], skus: [
    { code: 'COF-ARA-250', optionValues: { Size: '250g' }, packSize: '250g', priceCents: 950, taxClass: 'GST_FREE', openingStock: 35 },
    { code: 'COF-ARA-1KG', optionValues: { Size: '1kg' }, packSize: '1kg', priceCents: 3200, taxClass: 'GST_FREE', openingStock: 15 },
  ] },
  { id: 'prod-tea', slug: 'english-breakfast-tea-100', name: 'English Breakfast Tea', brand: 'First Light Roasters', glyph: '🍵', hue: 12, categories: ['cat-beverages', 'cat-bev-coffee'], description: 'Robust Assam–Ceylon blend in plastic-free pyramid bags.', specs: [['Count', '100 bags']], skus: [{ code: 'TEA-EBT-100', packSize: '100 bags', priceCents: 670, taxClass: 'GST_FREE', openingStock: 41 }] },
  { id: 'prod-sparkling', slug: 'sparkling-water-12x375', name: 'Sparkling Water', brand: 'Clear Springs', glyph: '🫧', hue: 200, categories: ['cat-beverages', 'cat-bev-soft'], description: 'Naturally carbonated mineral water in recyclable cans.', specs: [['Count', '12 × 375ml']], skus: [{ code: 'WTR-SPK-12', packSize: '12 × 375ml', priceCents: 990, taxClass: 'GST', openingStock: 62 }] },
  { id: 'prod-oj', slug: 'orange-juice-2l', name: 'Orange Juice', brand: 'Sunny Acres', glyph: '🧃', hue: 33, categories: ['cat-beverages', 'cat-bev-soft'], description: 'Not-from-concentrate juice, squeezed within 24 hours of picking. On special.', specs: [['Volume', '2L'], ['Type', 'No pulp']], skus: [{ code: 'OJ-NFC-2L', packSize: '2L', priceCents: 540, taxClass: 'GST', openingStock: 33, sale: { priceCents: 480 } }] },
  { id: 'prod-chocolate', slug: 'dark-chocolate-180g', name: 'Dark Chocolate 70%', brand: 'Cocoa Lane', glyph: '🍫', hue: 350, categories: ['cat-snacks'], description: 'Single-estate Ghanaian cacao, 70% solids.', specs: [['Weight', '180g'], ['Allergens', 'May contain milk, nuts']], skus: [{ code: 'CHO-DK70-180', packSize: '180g block', priceCents: 550, taxClass: 'GST', openingStock: 51 }] },
  { id: 'prod-chips', slug: 'salted-potato-chips-175g', name: 'Salted Potato Chips', brand: 'Coastal Crisps', glyph: '🥔', hue: 40, categories: ['cat-snacks'], description: 'Kettle-cooked in sunflower oil with sea salt.', specs: [['Weight', '175g']], skus: [{ code: 'CHP-SLT-175', packSize: '175g bag', priceCents: 380, taxClass: 'GST', openingStock: 75 }] },
  { id: 'prod-almonds', slug: 'roasted-almonds-750g', name: 'Roasted Almonds', brand: 'Golden Fields', glyph: '🌰', hue: 28, categories: ['cat-snacks'], description: 'Dry-roasted Australian almonds, lightly salted. Low stock.', specs: [['Weight', '750g']], skus: [{ code: 'ALM-RST-750', packSize: '750g pouch', priceCents: 1450, taxClass: 'GST', openingStock: 2, lowStockThreshold: 5 }] },
  { id: 'prod-crackers', slug: 'rice-crackers-100g', name: 'Rice Crackers', brand: 'Coastal Crisps', glyph: '🍘', hue: 20, categories: ['cat-snacks'], description: 'Light, crunchy crackers with soy and sesame.', specs: [['Weight', '100g'], ['Allergens', 'Contains soy, sesame']], skus: [{ code: 'RCR-SES-100', packSize: '100g', priceCents: 290, taxClass: 'GST', openingStock: 58 }] },
  { id: 'prod-laundry', slug: 'laundry-powder-4kg', name: 'Laundry Powder', brand: 'PureCycle', glyph: '🧺', hue: 215, categories: ['cat-household', 'cat-hh-laundry'], description: 'High-efficiency front- and top-loader powder with a eucalyptus scent.', specs: [['Weight', '4kg'], ['Washes', '≈ 80']], skus: [{ code: 'LDY-PWD-4KG', packSize: '4kg box', priceCents: 1890, taxClass: 'GST', openingStock: 28 }] },
  { id: 'prod-dishliquid', slug: 'dishwashing-liquid-1l', name: 'Dishwashing Liquid', brand: 'PureCycle', glyph: '🧼', hue: 195, categories: ['cat-household', 'cat-hh-cleaning'], description: 'Cuts grease with plant-derived surfactants.', specs: [['Volume', '1L']], skus: [{ code: 'DSH-LIQ-1L', packSize: '1L', priceCents: 450, taxClass: 'GST', openingStock: 64 }] },
  { id: 'prod-spray', slug: 'multi-surface-spray-500ml', name: 'Multi-Surface Spray', brand: 'PureCycle', glyph: '🧽', hue: 205, categories: ['cat-household', 'cat-hh-cleaning'], description: 'Antibacterial spray safe for benches, glass and tile.', specs: [['Volume', '500ml']], skus: [{ code: 'SPR-MUL-500', packSize: '500ml', priceCents: 520, taxClass: 'GST', openingStock: 39 }] },
  { id: 'prod-toiletpaper', slug: 'toilet-paper-24', name: 'Toilet Paper', brand: 'PureCycle', glyph: '🧻', hue: 185, categories: ['cat-household'], description: '3-ply recycled rolls, wrapped in paper not plastic.', specs: [['Count', '24 rolls'], ['Ply', '3']], skus: [{ code: 'TPP-3PL-24', packSize: '24 rolls', priceCents: 1990, taxClass: 'GST', openingStock: 36 }] },
  { id: 'prod-shampoo', slug: 'shampoo-750ml', name: 'Shampoo', brand: 'Bloom Botanics', glyph: '🧴', hue: 280, categories: ['cat-personal'], description: 'Sulfate-free shampoo with native kakadu plum.', specs: [['Volume', '750ml']], skus: [{ code: 'SHM-KAK-750', packSize: '750ml', priceCents: 1150, taxClass: 'GST', openingStock: 32 }] },
  { id: 'prod-toothpaste', slug: 'toothpaste-200g', name: 'Toothpaste', brand: 'Bloom Botanics', glyph: '🪥', hue: 170, categories: ['cat-personal'], description: 'Fluoride toothpaste with mint oil. On special.', specs: [['Weight', '200g']], skus: [{ code: 'TTH-MNT-200', packSize: '200g', priceCents: 480, taxClass: 'GST', openingStock: 49, sale: { priceCents: 430 } }] },
  { id: 'prod-handsoap', slug: 'hand-soap-500ml', name: 'Hand Soap', brand: 'Bloom Botanics', glyph: '🖐️', hue: 265, categories: ['cat-personal'], description: 'Moisturising liquid hand soap with lemon myrtle.', specs: [['Volume', '500ml']], skus: [{ code: 'HND-LEM-500', packSize: '500ml', priceCents: 390, taxClass: 'GST', openingStock: 52 }] },
  { id: 'prod-wagyu', slug: 'wagyu-scotch-fillet', name: 'Wagyu Scotch Fillet', brand: 'Black River Pastoral', glyph: '🥩', hue: 5, categories: ['cat-meat', 'cat-meat-beef'], description: 'Marble-score 6–7 Wagyu scotch fillet, hand-cut to order. Butter-soft with a deep, rich finish.', specs: [['Marbling', 'MB 6–7'], ['Aged', '21 days wet-aged'], ['Origin', 'King Valley, VIC']], skus: [
    { code: 'WAG-SCF-300', optionValues: { Cut: '300g steak' }, packSize: '300g', priceCents: 1890, taxClass: 'GST_FREE', openingStock: 25 },
    { code: 'WAG-SCF-500', optionValues: { Cut: '500g' }, packSize: '500g', priceCents: 2990, taxClass: 'GST_FREE', openingStock: 18 },
    { code: 'WAG-SCF-1KG', optionValues: { Cut: '1kg' }, packSize: '1kg', priceCents: 5490, taxClass: 'GST_FREE', openingStock: 8, lowStockThreshold: 10 },
  ] },
  { id: 'prod-mince', slug: 'grass-fed-beef-mince', name: 'Grass-Fed Beef Mince', brand: 'Black River Pastoral', glyph: '🥩', hue: 8, categories: ['cat-meat', 'cat-meat-beef'], description: 'Lean grass-fed mince, coarse-ground daily. Members save 60¢.', specs: [['Fat', '≈ 10%'], ['Origin', 'Gippsland, VIC']], skus: [{ code: 'MIN-BMF-500', packSize: '500g tray', priceCents: 850, memberPriceCents: 790, taxClass: 'GST_FREE', openingStock: 40 }] },
  { id: 'prod-sausages', slug: 'thick-beef-sausages', name: 'Thick Beef Sausages', brand: 'Aus Meat Co. Butchery', glyph: '🌭', hue: 20, categories: ['cat-meat', 'cat-meat-beef'], description: 'Coarse-ground beef snags with cracked pepper — built for the grill. On special this week.', specs: [['Weight', '≈ 1kg pack'], ['Allergens', 'Contains sulphites']], skus: [{ code: 'SAU-BEE-1KG', packSize: '≈ 1kg', priceCents: 1190, taxClass: 'GST_FREE', openingStock: 30, sale: { priceCents: 990 } }] },
  { id: 'prod-cutlets', slug: 'french-cut-lamb-cutlets', name: 'French-Cut Lamb Cutlets', brand: 'Highland Yards', glyph: '🍖', hue: 15, categories: ['cat-meat', 'cat-meat-lamb'], description: 'Frenched lamb cutlets from the Northern Tablelands. Running low today.', specs: [['Count', '8 cutlets · ≈ 600g'], ['Origin', 'Armidale, NSW']], skus: [{ code: 'LAM-CUT-8PK', packSize: '8 pack · ≈ 600g', priceCents: 2290, taxClass: 'GST_FREE', openingStock: 9, lowStockThreshold: 10 }] },
  { id: 'prod-lambleg', slug: 'lamb-leg-roast', name: 'Lamb Leg Roast', brand: 'Highland Yards', glyph: '🍖', hue: 12, categories: ['cat-meat', 'cat-meat-lamb'], description: 'Bone-in lamb leg, the classic Sunday roast. Score and rub for best results.', specs: [['Weight', '≈ 1.5kg'], ['Origin', 'Armidale, NSW']], skus: [{ code: 'LAM-LEG-15', packSize: '≈ 1.5kg', priceCents: 2850, taxClass: 'GST_FREE', openingStock: 10 }] },
  { id: 'prod-porkbelly', slug: 'skin-on-pork-belly', name: 'Skin-On Pork Belly', brand: 'Highland Yards', glyph: '🥓', hue: 6, categories: ['cat-meat', 'cat-meat-lamb'], description: 'Layered pork belly with crisp crackling potential — dry the skin overnight.', specs: [['Weight', '≈ 1kg piece']], skus: [{ code: 'PRK-BEL-1KG', packSize: '≈ 1kg', priceCents: 1690, taxClass: 'GST_FREE', openingStock: 12 }] },
  { id: 'prod-bacon', slug: 'middle-bacon', name: 'Middle Bacon', brand: 'Aus Meat Co. Butchery', glyph: '🥓', hue: 10, categories: ['cat-meat', 'cat-meat-lamb'], description: 'Double-smoked middle bacon, cut thick. On special.', specs: [['Weight', '500g']], skus: [{ code: 'BAC-MID-500', packSize: '500g', priceCents: 1090, taxClass: 'GST_FREE', openingStock: 22, sale: { priceCents: 950 } }] },
  { id: 'prod-thighs', slug: 'free-range-chicken-thighs', name: 'Free-Range Chicken Thighs', brand: 'Sunny Acres', glyph: '🍗', hue: 30, categories: ['cat-meat', 'cat-meat-poultry'], description: 'Boneless, skin-on thighs — juicy and forgiving on the grill. Members save $1.', specs: [['Weight', '700g'], ['Farming', 'Free range, RSPCA approved']], skus: [{ code: 'CHK-THG-700', packSize: '700g', priceCents: 1250, memberPriceCents: 1150, taxClass: 'GST_FREE', openingStock: 26 }] },
  { id: 'prod-wholechicken', slug: 'whole-free-range-chicken', name: 'Whole Free-Range Chicken', brand: 'Sunny Acres', glyph: '🍗', hue: 28, categories: ['cat-meat', 'cat-meat-poultry'], description: 'A 1.6kg rooster ready for the oven or the Weber.', specs: [['Weight', '≈ 1.6kg']], skus: [{ code: 'CHK-WHL-16', packSize: '≈ 1.6kg', priceCents: 1590, taxClass: 'GST_FREE', openingStock: 18 }] },
  { id: 'prod-breast', slug: 'chicken-breast-fillets', name: 'Chicken Breast Fillets', brand: 'Sunny Acres', glyph: '🍗', hue: 32, categories: ['cat-meat', 'cat-meat-poultry'], description: 'Twin-pack skinless breast fillets, trimmed by hand.', specs: [['Weight', '500g · 2 fillets']], skus: [{ code: 'CHK-BRS-500', packSize: '500g · 2 fillets', priceCents: 1150, taxClass: 'GST_FREE', openingStock: 24 }] },
  { id: 'prod-brisket', slug: 'smoked-beef-brisket', name: 'Beef Brisket (whole point)', brand: 'Black River Pastoral', glyph: '🥩', hue: 4, categories: ['cat-meat', 'cat-meat-beef'], description: 'Whole-packer brisket for low-and-slow weekends. Limited count — low stock.', specs: [['Weight', '≈ 1.2kg'], ['Cut', 'Whole point']], skus: [{ code: 'BRF-BSK-12', packSize: '≈ 1.2kg', priceCents: 2690, taxClass: 'GST_FREE', openingStock: 9, lowStockThreshold: 10 }] },
  { id: 'prod-chorizo', slug: 'spanish-style-chorizo', name: 'Spanish-Style Chorizo', brand: 'Aus Meat Co. Butchery', glyph: '🌭', hue: 18, categories: ['cat-meat', 'cat-meat-lamb'], description: 'Cured chorizo with smoked paprika — ready to slice or throw on the plancha.', specs: [['Weight', '250g'], ['Style', 'Cured, picante']], skus: [{ code: 'CHO-SPA-250', packSize: '250g', priceCents: 920, taxClass: 'GST', openingStock: 20 }] },
  { id: 'prod-draft-hamper', slug: 'seasonal-gift-hamper', name: 'Seasonal Gift Hamper', brand: 'Aus Food Store', glyph: '🎁', hue: 340, categories: ['cat-pantry'], description: 'Curated hamper in build-up for the gifting season — still a draft, so it is not visible in the store.', specs: [['Contents', 'To be confirmed']], skus: [{ code: 'GFT-HAM-STD', packSize: 'Standard', priceCents: 8900, taxClass: 'GST', openingStock: 0 }], status: 'DRAFT' },
];

export function buildCatalog(ctx: SeedCtx): {
  categories: Category[]; products: Product[]; inventory: Record<string, Inventory>;
  promotions: Promotion[]; banners: Banner[];
} {
  const categories: Category[] = [
    { id: 'cat-meat', slug: 'meat', name: 'Fresh Meat', parentId: null, displayOrder: 0, active: true, imageGlyph: '🥩' },
    { id: 'cat-meat-beef', slug: 'beef', name: 'Beef', parentId: 'cat-meat', displayOrder: 1, active: true, imageGlyph: '🐮' },
    { id: 'cat-meat-lamb', slug: 'lamb-pork', name: 'Lamb & Pork', parentId: 'cat-meat', displayOrder: 2, active: true, imageGlyph: '🐑' },
    { id: 'cat-meat-poultry', slug: 'poultry', name: 'Poultry', parentId: 'cat-meat', displayOrder: 3, active: true, imageGlyph: '🍗' },
    { id: 'cat-produce', slug: 'fresh-produce', name: 'Fresh Produce', parentId: null, displayOrder: 10, active: true, imageGlyph: '🥬' },
    { id: 'cat-bakery', slug: 'bakery', name: 'Bakery', parentId: null, displayOrder: 11, active: true, imageGlyph: '🥖' },
    { id: 'cat-dairy', slug: 'dairy-eggs', name: 'Dairy & Eggs', parentId: null, displayOrder: 12, active: true, imageGlyph: '🥛' },
    { id: 'cat-pantry', slug: 'pantry', name: 'Pantry Staples', parentId: null, displayOrder: 13, active: true, imageGlyph: '🍚' },
    { id: 'cat-beverages', slug: 'beverages', name: 'Beverages', parentId: null, displayOrder: 14, active: true, imageGlyph: '☕' },
    { id: 'cat-bev-coffee', slug: 'coffee-tea', name: 'Coffee & Tea', parentId: 'cat-beverages', displayOrder: 1, active: true, imageGlyph: '🍵' },
    { id: 'cat-bev-soft', slug: 'soft-drinks', name: 'Juice & Soft Drinks', parentId: 'cat-beverages', displayOrder: 2, active: true, imageGlyph: '🧃' },
    { id: 'cat-snacks', slug: 'snacks', name: 'Snacks & Confectionery', parentId: null, displayOrder: 15, active: true, imageGlyph: '🍫' },
    { id: 'cat-household', slug: 'household', name: 'Household', parentId: null, displayOrder: 16, active: true, imageGlyph: '🧺' },
    { id: 'cat-hh-cleaning', slug: 'cleaning', name: 'Cleaning', parentId: 'cat-household', displayOrder: 1, active: true, imageGlyph: '🧽' },
    { id: 'cat-hh-laundry', slug: 'laundry', name: 'Laundry', parentId: 'cat-household', displayOrder: 2, active: true, imageGlyph: '🧴' },
    { id: 'cat-personal', slug: 'personal-care', name: 'Personal Care', parentId: null, displayOrder: 17, active: true, imageGlyph: '🧼' },
  ];

  const products: Product[] = [];
  const inventory: Record<string, Inventory> = {};

  for (const spec of productSpecs) {
    const product: Product = {
      id: spec.id, slug: spec.slug, name: spec.name, brand: spec.brand,
      description: spec.description,
      specs: spec.specs.map(([label, value]) => ({ label, value })),
      imageGlyph: spec.glyph, imageHue: spec.hue, categoryIds: spec.categories,
      status: spec.status ?? 'ACTIVE', skus: [],
      createdAt: ctx.iso(-20 * DAY), updatedAt: ctx.iso(-2 * DAY),
    };
    for (const s of spec.skus) {
      const sku: Sku = {
        id: `sku-${s.code.toLowerCase()}`, code: s.code, productId: spec.id,
        optionValues: s.optionValues ?? {}, packSize: s.packSize,
        priceCents: s.priceCents, memberPriceCents: s.memberPriceCents,
        salePriceCents: s.sale?.priceCents,
        saleStartsAt: s.sale ? ctx.iso(-3 * DAY) : undefined,
        saleEndsAt: s.sale ? ctx.iso(11 * DAY) : undefined,
        taxClass: s.taxClass ?? 'GST', active: true,
      };
      product.skus.push(sku);
      ctx.skuByCode.set(s.code, sku);
      inventory[sku.id] = {
        skuId: sku.id, onHand: s.openingStock, reserved: 0, allocated: 0,
        lowStockThreshold: s.lowStockThreshold ?? 10, version: 1,
      };
      if (s.openingStock > 0) {
        ctx.movements.push({
          id: `mov-open-${sku.id}`, skuId: sku.id, type: 'SEED',
          deltas: { onHand: s.openingStock }, before: { onHand: 0, reserved: 0, allocated: 0 },
          after: { onHand: s.openingStock, reserved: 0, allocated: 0 },
          reference: 'OPENING-STOCK', reason: 'Opening stock at seed time', actor: 'system (seed)',
          createdAt: ctx.iso(-20 * DAY),
        });
      }
      ctx.productById.set(spec.id, product);
    }
    products.push(product);
  }

  const promotions: Promotion[] = [
    { id: 'promo-5', skuId: 'sku-sau-bee-1kg', salePriceCents: 990, startsAt: ctx.iso(-3 * DAY), endsAt: ctx.iso(11 * DAY), label: 'Sausage Sunday', active: true },
    { id: 'promo-6', skuId: 'sku-bac-mid-500', salePriceCents: 950, startsAt: ctx.iso(-3 * DAY), endsAt: ctx.iso(11 * DAY), label: 'Bacon drop', active: true },
    { id: 'promo-1', skuId: 'sku-brd-whl-650', salePriceCents: 360, startsAt: ctx.iso(-3 * DAY), endsAt: ctx.iso(11 * DAY), label: 'Bakery weekly special', active: true },
    { id: 'promo-2', skuId: 'sku-oj-nfc-2l', salePriceCents: 480, startsAt: ctx.iso(-3 * DAY), endsAt: ctx.iso(11 * DAY), label: 'Chilled drinks special', active: true },
    { id: 'promo-3', skuId: 'sku-tth-mnt-200', salePriceCents: 430, startsAt: ctx.iso(-3 * DAY), endsAt: ctx.iso(11 * DAY), label: 'Personal care special', active: true },
    { id: 'promo-4', skuId: 'sku-cof-ara-250', salePriceCents: 850, startsAt: ctx.iso(2 * DAY), endsAt: ctx.iso(9 * DAY), label: 'Upcoming coffee promo', active: true },
  ];

  const banners: Banner[] = [
    { id: 'banner-1', title: 'The winter cut box', subtitle: 'Grass-fed beef & lamb, up to 20% off this week', glyph: '🥩', hue: 8, destinationPath: '/categories/meat', displayOrder: 1, active: true },
    { id: 'banner-2', title: 'Sausage Sunday', subtitle: 'Thick beef snags — $9.90 a kilo while they last', glyph: '🌭', hue: 28, destinationPath: '/categories/meat', displayOrder: 2, active: true },
    { id: 'banner-3', title: 'Members carve better prices', subtitle: 'Member pricing on prime cuts, every day', glyph: '🍖', hue: 350, destinationPath: '/categories/meat', displayOrder: 3, active: true },
    { id: 'banner-4', title: 'Christmas hams (draft)', subtitle: 'Not published yet', glyph: '🎄', hue: 10, destinationPath: '/categories/meat', displayOrder: 4, active: false },
  ];

  return { categories, products, inventory, promotions, banners };
}
