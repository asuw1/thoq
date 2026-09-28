import type { Kind, Place, PriceLevel } from './types';
import { areaByName } from './vocabulary';

/**
 * Demo catalogue. Every place here is fictional — names, menus and hours are
 * invented to exercise the app. Real data should come from an open places
 * dataset (Foursquare OS Places / OpenStreetMap) plus owner claims; see README.
 */

function hm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function p(
  id: string,
  name: string,
  nameAr: string,
  kind: Kind,
  category: string,
  area: string,
  offset: [number, number],
  price: PriceLevel,
  hours: [string, string],
  tags: string[],
  menu: string[],
): Place {
  const a = areaByName(area);
  return {
    id,
    name,
    nameAr,
    kind,
    category,
    area,
    lat: +(a.lat + offset[0]).toFixed(5),
    lng: +(a.lng + offset[1]).toFixed(5),
    price,
    hours: { open: hm(hours[0]), close: hm(hours[1]) },
    tags,
    menu,
  };
}

export const PLACES: Place[] = [
  // Cafés
  p('nabta', 'Nabta Coffee Lab', 'نبتة', 'cafe', 'Specialty roastery', 'Al Malqa', [0.004, 0.002], 2, ['07:00', '01:00'],
    ['pour-over', 'light-roast', 'roastery', 'quiet', 'laptop', 'late'], ['V60 Ethiopia Guji', 'Cortado', 'Batch brew', 'Cardamom bun']),
  p('kiln', 'Kiln & Cup', 'كِلن', 'cafe', 'Espresso bar', 'Al Olaya', [0.002, -0.003], 2, ['06:30', '23:00'],
    ['espresso', 'counter', 'lively', 'pastry'], ['Flat white', 'Espresso tonic', 'Pistachio croissant', 'Piccolo']),
  p('qirtas', 'Qirtas', 'قرطاس', 'cafe', 'Bakery café', 'As Sulimaniyah', [-0.002, 0.003], 2, ['07:00', '00:00'],
    ['pastry', 'sourdough', 'espresso', 'outdoor', 'breakfast'], ['Sourdough loaf', 'Kouign-amann', 'Latte', 'Za’atar danish']),
  p('dallah-house', 'Dallah House', 'بيت الدلة', 'cafe', 'Saudi coffee house', 'Diriyah', [0.003, 0.004], 1, ['16:00', '02:00'],
    ['saudi-coffee', 'outdoor', 'family', 'late', 'desserts'], ['Qahwa with saffron', 'Sukkari dates', 'Luqaimat', 'Karak']),
  p('mirkaz', 'Mirkaz Espresso', 'مركز', 'cafe', 'Espresso bar', 'KAFD', [-0.001, 0.002], 2, ['06:00', '22:00'],
    ['espresso', 'laptop', 'counter', 'quiet'], ['Double espresso', 'Cortado', 'Cold brew', 'Banana bread']),
  p('lail', 'Lail', 'ليل', 'cafe', 'Late-night café', 'Hittin', [0.002, 0.001], 2, ['18:00', '03:00'],
    ['late', 'lively', 'cold-brew', 'desserts', 'date'], ['Spanish latte', 'Cold brew tonic', 'Tiramisu', 'Iced V60']),
  p('ghaf', 'Ghaf Roasters', 'غاف', 'cafe', 'Specialty roastery', 'Al Yasmin', [-0.003, -0.002], 2, ['07:00', '00:00'],
    ['pour-over', 'light-roast', 'roastery', 'cold-brew', 'counter'], ['Chemex Kenya', 'Aeropress Colombia', 'Cold brew', 'Filter flight']),
  p('warraq', 'Warraq', 'ورّاق', 'cafe', 'Bookshop café', 'Al Murabba', [0.002, 0.002], 1, ['09:00', '23:00'],
    ['quiet', 'laptop', 'pour-over', 'pastry'], ['Hand brew', 'Hot chocolate', 'Date cake', 'Americano']),
  p('saqf', 'Saqf', 'سقف', 'cafe', 'Rooftop café', 'Al Olaya', [-0.004, 0.004], 3, ['16:00', '02:00'],
    ['outdoor', 'date', 'late', 'desserts', 'espresso'], ['Iced latte', 'Pistachio kunafa', 'Affogato', 'Mint lemonade']),
  p('bunn-station', 'Bunn Station', 'محطة البن', 'cafe', 'Drive-through coffee', 'Al Rawdah', [0.001, -0.002], 1, ['05:30', '00:00'],
    ['espresso', 'cold-brew'], ['Spanish latte', 'Iced americano', 'Cookie']),
  p('hijra', 'Hijra Coffee', 'هجرة', 'cafe', 'Specialty café', 'Al Nakheel', [0.002, 0.003], 2, ['07:00', '00:30'],
    ['pour-over', 'espresso', 'laptop', 'outdoor', 'light-roast'], ['V60 Yemen Haraz', 'Flat white', 'Cold drip', 'Lemon loaf']),
  p('samra', 'Samra', 'سمرة', 'cafe', 'Saudi coffee & sweets', 'Al Malqa', [-0.003, 0.004], 1, ['15:00', '01:00'],
    ['saudi-coffee', 'desserts', 'family', 'outdoor'], ['Qahwa khawlani', 'Kleija', 'Maamoul', 'Ginger tea']),
  p('press', 'Press & Pour', 'بريس', 'cafe', 'Brew bar', 'Al Yasmin', [0.003, 0.003], 2, ['08:00', '23:30'],
    ['pour-over', 'counter', 'light-roast', 'quiet'], ['Siphon Panama', 'V60 Rwanda', 'Cascara soda']),
  p('cardamom', 'Cardamom Room', 'غرفة الهيل', 'cafe', 'Café & brunch', 'Hittin', [-0.002, -0.003], 3, ['07:30', '23:00'],
    ['breakfast', 'pastry', 'outdoor', 'family', 'espresso'], ['Shakshuka', 'Cardamom latte', 'French toast', 'Halloumi croissant']),
  p('studio-9', 'Studio Nine', 'ستوديو ٩', 'cafe', 'Work café', 'KAFD', [0.003, -0.002], 2, ['06:00', '00:00'],
    ['laptop', 'quiet', 'espresso', 'cold-brew'], ['Americano', 'Oat cortado', 'Protein bowl', 'Cold brew']),
  p('sukkar', 'Sukkar Bakehouse', 'سكّر', 'cafe', 'Bakery', 'Al Nakheel', [-0.002, -0.002], 2, ['06:30', '22:00'],
    ['sourdough', 'pastry', 'desserts', 'breakfast'], ['Croissant', 'Cinnamon knot', 'Sourdough', 'Basque cheesecake']),
  p('majlis-beans', 'Majlis Beans', 'مجلس البن', 'cafe', 'Specialty roastery', 'As Sulimaniyah', [0.004, -0.001], 2, ['07:00', '01:00'],
    ['roastery', 'pour-over', 'saudi-coffee', 'counter', 'late'], ['Saudi coffee flight', 'V60 Ethiopia Sidamo', 'Cortado']),
  p('rawda-corner', 'Rawda Corner', 'زاوية الروضة', 'cafe', 'Neighbourhood café', 'Al Rawdah', [-0.002, 0.003], 1, ['06:00', '23:00'],
    ['espresso', 'family', 'breakfast'], ['Latte', 'Egg sandwich', 'Karak', 'Muffin']),

  // Restaurants
  p('najd-table', 'Najd Table', 'سفرة نجد', 'restaurant', 'Najdi', 'Diriyah', [-0.003, 0.002], 3, ['12:30', '00:00'],
    ['saudi', 'family', 'outdoor', 'date'], ['Jareesh', 'Lamb kabsa', 'Margoog', 'Qursan']),
  p('mandi-alley', 'Mandi Alley', 'زقاق المندي', 'restaurant', 'Mandi & madghout', 'Al Rawdah', [0.003, 0.001], 1, ['11:00', '02:00'],
    ['saudi', 'grill', 'family', 'late'], ['Chicken mandi', 'Lamb madghout', 'Salata hara']),
  p('sakura-counter', 'Sakura Counter', 'ساكورا', 'restaurant', 'Omakase & sushi', 'Al Olaya', [0.001, 0.001], 4, ['18:30', '23:30'],
    ['japanese', 'seafood', 'counter', 'date', 'quiet'], ['Omakase 14 pieces', 'Toro hand roll', 'Miso black cod']),
  p('ramen-dori', 'Ramen Dori', 'رامن دوري', 'restaurant', 'Ramen bar', 'Hittin', [0.001, 0.004], 2, ['12:00', '00:00'],
    ['japanese', 'counter', 'lively', 'late'], ['Tori paitan', 'Spicy miso', 'Gyoza', 'Karaage']),
  p('beirut-oven', 'Beirut Oven', 'فرن بيروت', 'restaurant', 'Levantine bakery', 'Al Malqa', [0.001, -0.004], 1, ['06:00', '01:00'],
    ['levantine', 'breakfast', 'family'], ['Za’atar manakeesh', 'Cheese fatayer', 'Lahm bi ajeen']),
  p('jasmine-garden', 'Jasmine Garden', 'حديقة الياسمين', 'restaurant', 'Levantine grill', 'Al Yasmin', [0.001, -0.003], 3, ['13:00', '01:00'],
    ['levantine', 'grill', 'outdoor', 'family', 'date'], ['Mixed grill', 'Fattoush', 'Kibbeh nayeh', 'Muhammara']),
  p('trattoria-nove', 'Trattoria Nove', 'تراتوريا نوفي', 'restaurant', 'Italian', 'As Sulimaniyah', [-0.004, -0.002], 3, ['12:30', '23:30'],
    ['italian', 'date', 'quiet'], ['Cacio e pepe', 'Burrata', 'Veal milanese', 'Tiramisu']),
  p('forno', 'Forno Rosso', 'فورنو روسو', 'restaurant', 'Neapolitan pizza', 'Al Nakheel', [0.004, -0.003], 2, ['12:00', '00:30'],
    ['italian', 'lively', 'family'], ['Margherita', 'Diavola', 'Truffle bianca']),
  p('smash-lab', 'Smash Lab', 'سماش لاب', 'restaurant', 'Smash burgers', 'Al Malqa', [-0.001, 0.005], 1, ['13:00', '03:00'],
    ['burgers', 'late', 'lively'], ['Double smash', 'Truffle fries', 'Chicken sando']),
  p('tandoor-house', 'Tandoor House', 'بيت التنور', 'restaurant', 'North Indian', 'Al Olaya', [0.004, -0.001], 2, ['12:00', '00:00'],
    ['indian', 'grill', 'family'], ['Butter chicken', 'Garlic naan', 'Lamb seekh kebab', 'Dal makhani']),
  p('red-sea-catch', 'Red Sea Catch', 'صيد البحر الأحمر', 'restaurant', 'Seafood', 'Hittin', [-0.004, 0.002], 3, ['13:00', '00:00'],
    ['seafood', 'grill', 'family', 'outdoor'], ['Hamour sayadiyah', 'Grilled prawns', 'Fish fillet sandwich']),
  p('fatoor', 'Fatoor', 'فطور', 'restaurant', 'All-day breakfast', 'Al Nakheel', [0.001, 0.005], 2, ['06:00', '16:00'],
    ['breakfast', 'saudi', 'family', 'outdoor'], ['Shakshuka', 'Foul', 'Balaleet', 'Masoub']),
  p('ember', 'Ember', 'جمرة', 'restaurant', 'Wood-fire grill', 'KAFD', [-0.003, -0.003], 4, ['18:00', '01:00'],
    ['grill', 'date', 'quiet'], ['Dry-aged ribeye', 'Charred cauliflower', 'Bone marrow']),
  p('izakaya-kumo', 'Izakaya Kumo', 'إيزاكايا كومو', 'restaurant', 'Izakaya', 'Al Olaya', [-0.001, 0.005], 3, ['18:00', '01:00'],
    ['japanese', 'lively', 'late', 'counter'], ['Yakitori set', 'Agedashi tofu', 'Wagyu tataki']),
  p('bab-alyemen', 'Bab Al Yemen', 'باب اليمن', 'restaurant', 'Yemeni', 'Al Murabba', [-0.002, -0.003], 1, ['11:00', '01:00'],
    ['saudi', 'grill', 'family'], ['Haneeth', 'Saltah', 'Fahsa', 'Malawah']),
  p('dosa-point', 'Dosa Point', 'دوسا بوينت', 'restaurant', 'South Indian', 'Al Murabba', [0.003, -0.004], 1, ['07:00', '23:30'],
    ['indian', 'breakfast'], ['Masala dosa', 'Idli sambar', 'Filter coffee']),
  p('olive-and-thyme', 'Olive & Thyme', 'زيتون وزعتر', 'restaurant', 'Levantine mezze', 'As Sulimaniyah', [0.002, 0.004], 2, ['12:00', '00:00'],
    ['levantine', 'date', 'outdoor'], ['Hummus beiruti', 'Arayes', 'Batata harra', 'Knafeh']),
  p('dune-burger', 'Dune Burger', 'ديون برجر', 'restaurant', 'Burgers', 'Al Yasmin', [-0.004, 0.001], 2, ['12:00', '02:00'],
    ['burgers', 'lively', 'family', 'late'], ['Classic cheeseburger', 'Onion rings', 'Date shake']),
];

export const PLACE_BY_ID: Record<string, Place> = Object.fromEntries(PLACES.map((pl) => [pl.id, pl]));
