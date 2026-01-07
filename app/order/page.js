"use client";
import { useEffect, useState, Suspense, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

// --- CONFIG ---
const SHOP_LOCATION = { lat: 18.476304, lng: 100.188412 };
const ALLOWED_DISTANCE_METERS = 12; // Test Mode

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// --- CONSTANTS ---
const NOODLE_OPTIONS = ["เส้นเล็ก", "เส้นใหญ่", "หมี่ขาว", "บะหมี่เหลือง", "มาม่า", "วุ้นเส้น"];
const EXTRA_OPTIONS = [
  { name: "ลูกชิ้น (+10)", price: 10 },
  { name: "กากหมู (+10)", price: 10 },
  { name: "ผักบุ้ง (+5)", price: 5 },
  { name: "ไม่งอก", price: 0 },
  { name: "ไม่ผักโรย", price: 0 }
];

// --- UTILS ---
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  var R = 6371; 
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1); 
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c * 1000; 
}
function deg2rad(deg) { return deg * (Math.PI/180); }

// --- MAIN COMPONENT ---
function OrderPageContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table"); 
  
  const [menu, setMenu] = useState([]);
  const [table, setTable] = useState(null);
  const [cart, setCart] = useState([]); 
  const [activeCategory, setActiveCategory] = useState('Noodles');
  const [selections, setSelections] = useState({});
  const [userLocation, setUserLocation] = useState(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [showCartDetail, setShowCartDetail] = useState(false);
  const [locationStatus, setLocationStatus] = useState('allowed'); // Default allowed for testing
  const [distance, setDistance] = useState(0);

  // --- EFFECTS ---
  useEffect(() => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                setUserLocation({ lat: userLat, lng: userLng });
                const dist = getDistanceFromLatLonInM(SHOP_LOCATION.lat, SHOP_LOCATION.lng, userLat, userLng);
                setDistance(Math.round(dist));
            },
            (err) => console.warn("GPS Warning:", err),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    }
  }, []);

  useEffect(() => {
    if (!tableId) return; 
    const initData = async () => {
       const { data: t } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
       if (t) setTable(t);
       const { data: m } = await supabase.from("restaurant_menus").select("*").eq("is_available", true).order("id");
       if (m) setMenu(m);
    };
    initData();
  }, [tableId]);

  // --- LOGIC ---
  const getSelection = (itemId) => selections[itemId] || { noodle: '', extras: [], isTakeaway: false };
  const handleNoodleChange = (itemId, val) => { setSelections(prev => ({ ...prev, [itemId]: { ...getSelection(itemId), noodle: val } })); };
  const handleExtraToggle = (itemId, extraName) => { const current = getSelection(itemId); const newExtras = current.extras.includes(extraName) ? current.extras.filter(e => e !== extraName) : [...current.extras, extraName]; setSelections(prev => ({ ...prev, [itemId]: { ...current, extras: newExtras } })); };
  const handleTakeawayToggle = (itemId) => { const current = getSelection(itemId); setSelections(prev => ({ ...prev, [itemId]: { ...current, isTakeaway: !current.isTakeaway } })); };
  
  const calculateItemPrice = (item, variant, extras) => {
      let price = variant === 'special' ? item.price_special : item.price;
      extras.forEach(exName => { const exOption = EXTRA_OPTIONS.find(e => e.name === exName); if (exOption) price += exOption.price; });
      return price;
  };

  const addToCart = (item, variant = 'normal') => { 
      const sel = getSelection(item.id); 
      if (item.category === 'Noodles' && !sel.noodle) return alert("กรุณาเลือกเส้นก่อนครับ 🍜"); 
      const newItem = { uuid: Date.now() + Math.random(), id: item.id, name: item.name, variant: variant, noodle: sel.noodle || 'none', extras: [...sel.extras], isTakeaway: sel.isTakeaway, pricePerUnit: calculateItemPrice(item, variant, sel.extras), category: item.category };
      setCart(prev => [...prev, newItem]);
      // Reset selection after add (optional, makes UI cleaner)
      setSelections(prev => ({ ...prev, [item.id]: { noodle: '', extras: [], isTakeaway: false } }));
  };
  
  const deleteItemFromCartByUUID = (uuid) => { setCart(prev => prev.filter(item => item.uuid !== uuid)); if (cart.length <= 1) setShowCartDetail(false); };

  const handleOrderNow = async () => {
    if (cart.length === 0) return;
    if (!confirm("ยืนยันการสั่งอาหาร?")) return;
    setIsOrdering(true);
    try {
        const items = cart.map(c => {
            let extrasText = "";
            c.extras.forEach(exName => { const exOption = EXTRA_OPTIONS.find(e => e.name === exName); if(exOption) extrasText += ` +${exName}`; });
            let fullName = c.name;
            if (c.noodle && c.noodle !== 'none') fullName += ` [${c.noodle}]`;
            if (c.variant === 'special') fullName += ` (พิเศษ)`;
            if (extrasText) fullName += extrasText;
            return { id: c.id, name: fullName, price: c.pricePerUnit, quantity: 1, is_takeaway: c.isTakeaway };
        });
        const total = items.reduce((s, i) => s + i.price, 0);
        await supabase.from('orders').insert([{ table_number: table.table_number, items, total_price: total, status: 'pending', payment_status: 'pending', order_type: 'dine_in', location_lat: userLocation?.lat, location_lng: userLocation?.lng }]);
        await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', table.id);
        setIsOrdering(false); setCart([]); setSelections({}); setShowCartDetail(false);
        alert("✅ ส่งออเดอร์เรียบร้อยครับ!");
    } catch (err) { setIsOrdering(false); alert(`Error: ${err.message}`); }
  };

  const categories = ['Noodles', 'GaoLao', 'Sides', 'Drinks'];
  const categoryNames = {'Noodles': '🍜 ก๋วยเตี๋ยว', 'GaoLao': '🍲 เกาเหลา', 'Sides': '🍟 ทานเล่น', 'Drinks': '🥤 เครื่องดื่ม'};
  const filteredMenu = useMemo(() => activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory), [menu, activeCategory]);
  const totalItems = cart.length;
  const totalPrice = cart.reduce((sum, item) => sum + item.pricePerUnit, 0);

  // --- UI STATES ---
  if (!tableId) return <div className="h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-400 font-medium p-4 text-center"><div className="text-4xl mb-4">📷</div>กรุณาสแกน QR Code ที่โต๊ะนะครับ</div>;
  if (!table) return <div className="h-screen flex items-center justify-center text-gray-400 bg-gray-50 animate-pulse">กำลังโหลดเมนู...</div>;

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans text-gray-800 pb-32">
      
      {/* 1. Header (Clean & Modern) */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex justify-between items-center shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Bella Cucina 🍕</h1>
            <div className="flex items-center gap-2 mt-0.5">
                <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full">โต๊ะ {table.table_number}</span>
                <span className="text-[10px] text-gray-400">ห่าง {distance}ม.</span>
            </div>
          </div>
          <div className="w-10 h-10 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
              <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${tableId}`} alt="User" />
          </div>
      </div>
      
      {/* 2. Category Filter (Pill Shape) */}
      <div className="sticky top-[72px] z-30 bg-[#FAFAFA]/95 py-3 px-4 overflow-x-auto no-scrollbar flex gap-3">
          {categories.map(cat => ( 
              <button key={cat} onClick={() => setActiveCategory(cat)} 
                  className={`px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm ${activeCategory === cat ? 'bg-orange-600 text-white ring-2 ring-orange-200' : 'bg-white text-gray-500 border border-gray-100'}`}>
                  {categoryNames[cat]}
              </button> 
          ))}
      </div>

      {/* 3. Menu Grid (Clean Cards) */}
      <div className="px-4 mt-2 grid grid-cols-1 gap-4">
        {filteredMenu.map((item) => { 
            const sel = getSelection(item.id); 
            const hasSpecial = item.price_special > 0; 
            
            return (
          <div key={item.id} className="bg-white p-4 rounded-[20px] shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-gray-100/50 flex flex-col gap-3 relative overflow-hidden group">
             {/* Image & Title */}
             <div className="flex gap-4">
                 <div className="w-20 h-20 bg-gray-100 rounded-2xl flex-shrink-0 overflow-hidden">
                     {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-2xl">🍲</div>}
                 </div>
                 <div className="flex-1 flex flex-col justify-center">
                     <h3 className="font-bold text-gray-800 text-lg leading-tight">{item.name}</h3>
                     <p className="text-xs text-gray-400 mt-1 line-clamp-1">{item.category}</p>
                     <div className="mt-2 flex items-center gap-2">
                         <span className="font-bold text-orange-600 text-lg">฿{item.price}</span>
                         {hasSpecial && <span className="text-[10px] text-gray-400 line-through">฿{item.price_special}</span>}
                     </div>
                 </div>
             </div>

             {/* Options Section (ย่อให้ดูง่าย) */}
             <div className="space-y-3 pt-2">
                 {item.category === 'Noodles' && (
                     <div className="relative">
                         <select className="w-full appearance-none bg-gray-50 border border-gray-100 text-gray-600 text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-orange-300" value={sel.noodle} onChange={(e) => handleNoodleChange(item.id, e.target.value)}>
                             <option value="" disabled>🍜 เลือกเส้น...</option>
                             {NOODLE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                         </select>
                         <div className="absolute right-3 top-3 text-gray-400 pointer-events-none text-xs">▼</div>
                     </div>
                 )}
                 
                 {['Noodles', 'GaoLao'].includes(item.category) && (
                     <div className="flex flex-wrap gap-2">
                         {EXTRA_OPTIONS.map((ex) => ( 
                             <button key={ex.name} onClick={() => handleExtraToggle(item.id, ex.name)} 
                                 className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${sel.extras.includes(ex.name) ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-gray-100 text-gray-400'}`}>
                                 {ex.name}
                             </button> 
                         ))}
                     </div>
                 )}

                 {/* Action Buttons */}
                 <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-1">
                     <button onClick={() => handleTakeawayToggle(item.id)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${sel.isTakeaway ? 'bg-red-50 text-red-600' : 'text-gray-400 bg-gray-50'}`}>
                         <span>🛍️</span> {sel.isTakeaway ? 'กลับบ้าน' : 'ทานนี่'}
                     </button>
                     <div className="flex gap-2">
                         <button onClick={()=>addToCart(item, 'normal')} className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl shadow-lg shadow-gray-200 active:scale-95 transition-transform">
                             + ใส่ตะกร้า
                         </button>
                         {hasSpecial && (
                             <button onClick={()=>addToCart(item, 'special')} className="px-4 py-2 bg-orange-100 text-orange-700 text-xs font-bold rounded-xl active:scale-95 transition-transform">
                                 พิเศษ
                             </button>
                         )}
                     </div>
                 </div>
             </div>
          </div>
        )})}
      </div>

      {/* 4. Floating Cart Bar (Glassmorphism) */}
      {totalItems > 0 && ( 
        <div className="fixed bottom-6 left-0 w-full px-6 z-50 animate-slide-up">
            <div className="bg-gray-900/90 backdrop-blur-md text-white p-2 pl-5 pr-2 rounded-2xl shadow-2xl flex justify-between items-center border border-white/10">
                <div onClick={() => setShowCartDetail(true)} className="flex items-center gap-4 cursor-pointer flex-1">
                    <div className="bg-orange-500 w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-lg shadow-orange-500/30">{totalItems}</div>
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-300 font-medium">ยอดรวม</span>
                        <span className="font-bold text-lg leading-none">฿{totalPrice}</span>
                    </div>
                </div>
                <button onClick={handleOrderNow} disabled={isOrdering} className="bg-white text-gray-900 px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-100 transition-colors shadow-lg">
                    {isOrdering ? '...' : 'สั่งเลย >'}
                </button>
            </div>
        </div> 
      )}

      {/* 5. Cart Modal (Clean Sheet) */}
      {showCartDetail && totalItems > 0 && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end justify-center animate-fade-in">
              <div className="bg-white w-full max-w-md rounded-t-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up">
                  <div className="p-6 pb-2 flex justify-between items-center">
                      <h2 className="text-2xl font-bold text-gray-800">รายการที่สั่ง 🛒</h2>
                      <button onClick={() => setShowCartDetail(false)} className="w-8 h-8 bg-gray-100 rounded-full text-gray-500 font-bold">✕</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {cart.map((item, index) => (
                          <div key={item.uuid} className="flex justify-between items-start pb-4 border-b border-gray-50 last:border-0">
                              <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                      <span className="font-bold text-gray-800">{index + 1}. {item.name}</span>
                                      {item.isTakeaway && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">กลับบ้าน</span>}
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1">
                                      {item.variant === 'special' && 'พิเศษ '}
                                      {item.noodle && item.noodle !== 'none' && `• ${item.noodle} `}
                                      {item.extras.length > 0 && `• ${item.extras.join(', ')}`}
                                  </p>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                  <span className="font-bold text-gray-800">฿{item.pricePerUnit}</span>
                                  <button onClick={() => deleteItemFromCartByUUID(item.uuid)} className="text-red-400 text-xs underline">ลบ</button>
                              </div>
                          </div>
                      ))}
                  </div>
                  <div className="p-6 bg-gray-50 border-t border-gray-100">
                      <div className="flex justify-between items-center mb-4">
                          <span className="text-gray-500">รวมทั้งหมด</span>
                          <span className="text-3xl font-bold text-gray-900">฿{totalPrice}</span>
                      </div>
                      <button onClick={handleOrderNow} disabled={isOrdering} className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-gray-200 active:scale-95 transition-all">
                          ยืนยันการสั่งอาหาร
                      </button>
                  </div>
              </div>
          </div>
      )}

      <style jsx global>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } 
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } } 
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
        .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
export default function OrderPage() { return <Suspense fallback={<div>Loading...</div>}><OrderPageContent /></Suspense>; }