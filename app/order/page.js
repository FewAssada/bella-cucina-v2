"use client";
import { useEffect, useState, Suspense, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

// 🔥 1. ตั้งค่าพิกัดร้าน (ตามที่คุณขอมา)
const SHOP_LOCATION = {
  lat: 18.476304, 
  lng: 100.188412
};

// 🔥 2. ระยะที่ยอมให้สั่งได้ (12 เมตร)
// คำเตือน: 12 เมตรแคบมาก ถ้าลูกค้า GPS ไม่ดีอาจจะสั่งไม่ได้ ให้ลองขยับเป็น 20-30 ถ้าเจอปัญหา
const ALLOWED_DISTANCE_METERS = 12; 

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const NOODLE_OPTIONS = ["เส้นเล็ก", "เส้นใหญ่", "หมี่ขาว", "บะหมี่เหลือง", "มาม่า", "วุ้นเส้น"];
const EXTRA_OPTIONS = [
  { name: "เพิ่มลูกชิ้น (3 ลูก)", price: 10 },
  { name: "กากหมูเจียว", price: 10 },
  { name: "เพิ่มผักบุ้ง", price: 5 },
  { name: "ไม่ใส่ถั่วงอก", price: 0 },
  { name: "ไม่ใส่ผักโรย", price: 0 }
];

// ฟังก์ชันคำนวณระยะทาง (Haversine Formula)
function getDistanceFromLatLonInM(lat1, lon1, lat2, lon2) {
  var R = 6371; 
  var dLat = deg2rad(lat2 - lat1);
  var dLon = deg2rad(lon2 - lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; 
  return d * 1000; 
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

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

  // State สำหรับตรวจสอบพิกัด
  const [locationStatus, setLocationStatus] = useState('checking'); // checking, allowed, denied, error, too_far
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    if (!navigator.geolocation) {
        setLocationStatus('error');
        return;
    }

    // ฟังก์ชันสำเร็จ (Success)
    const success = (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        
        setUserLocation({ lat: userLat, lng: userLng });

        const dist = getDistanceFromLatLonInM(SHOP_LOCATION.lat, SHOP_LOCATION.lng, userLat, userLng);
        setDistance(Math.round(dist));

        if (dist <= ALLOWED_DISTANCE_METERS) {
            setLocationStatus('allowed'); 
        } else {
            setLocationStatus('too_far');
        }
    };

    // ฟังก์ชันล้มเหลว (Error)
    const error = (err) => {
        console.error("GPS Error:", err);
        setLocationStatus('denied');
    };

    // เรียกขอพิกัด (ขอความแม่นยำสูง)
    navigator.geolocation.getCurrentPosition(success, error, { 
        enableHighAccuracy: true, 
        timeout: 5000, 
        maximumAge: 0 
    });

  }, []);

  useEffect(() => {
    // ถ้าไม่มีโต๊ะ หรือ GPS ไม่ผ่าน ไม่ต้องโหลดข้อมูล
    if (!tableId || locationStatus !== 'allowed') return; 
    
    const initData = async () => {
       const { data: t } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
       if (t) setTable(t);
       const { data: m } = await supabase.from("restaurant_menus").select("*").eq("is_available", true).order("id");
       if (m) setMenu(m);
    };
    initData();
  }, [tableId, locationStatus]);

  // Helper Functions
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
      
      // สร้าง UUID เพื่อให้แต่ละรายการไม่ซ้ำกัน (แยกบรรทัด)
      const newItem = { 
          uuid: Date.now() + Math.random(), 
          id: item.id, 
          name: item.name, 
          variant: variant, 
          noodle: sel.noodle || 'none', 
          extras: [...sel.extras], 
          isTakeaway: sel.isTakeaway, 
          pricePerUnit: calculateItemPrice(item, variant, sel.extras), 
          category: item.category 
      };
      setCart(prev => [...prev, newItem]);
  };
  
  // ลบรายการล่าสุดที่เหมือนกัน (จากหน้าเมนู)
  const removeFromCart = (item, variant = 'normal') => { 
      const sel = getSelection(item.id); 
      const indexToRemove = [...cart].reverse().findIndex(cartItem => cartItem.id === item.id && cartItem.variant === variant && cartItem.noodle === (sel.noodle || 'none') && JSON.stringify(cartItem.extras.sort()) === JSON.stringify(sel.extras.sort()) && cartItem.isTakeaway === sel.isTakeaway);
      if (indexToRemove !== -1) { const realIndex = cart.length - 1 - indexToRemove; setCart(prev => prev.filter((_, i) => i !== realIndex)); }
  };

  // ลบรายการเจาะจง (จากหน้าตะกร้า)
  const deleteItemFromCartByUUID = (uuid) => { 
      setCart(prev => prev.filter(item => item.uuid !== uuid)); 
      if (cart.length <= 1) setShowCartDetail(false); 
  };
  
  const getQtyInCart = (item, variant) => { const sel = getSelection(item.id); return cart.filter(cartItem => cartItem.id === item.id && cartItem.variant === variant && cartItem.noodle === (sel.noodle || 'none') && JSON.stringify(cartItem.extras.sort()) === JSON.stringify(sel.extras.sort()) && cartItem.isTakeaway === sel.isTakeaway).length; };

  const handleOrderNow = async () => {
    if (cart.length === 0) return;
    if (!confirm("ยืนยันสั่งอาหารเลยไหมครับ? 😋")) return;
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
        
        // ส่งออเดอร์ (สถานะรอจ่ายเงิน)
        const { error: dbError } = await supabase.from('orders').insert([{ 
            table_number: table.table_number, 
            items, 
            total_price: total, 
            status: 'pending', 
            payment_status: 'pending', 
            order_type: 'dine_in', 
            location_lat: userLocation?.lat || null, 
            location_lng: userLocation?.lng || null 
        }]);
        
        if (dbError) throw dbError;
        
        // อัปเดตโต๊ะว่ามีคนนั่ง
        await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', table.id);
        
        setIsOrdering(false); 
        setCart([]); 
        setSelections({}); 
        setShowCartDetail(false);
        alert("✅ สั่งอาหารเรียบร้อย! รอเสิร์ฟสักครู่นะครับ");
    } catch (err) { 
        setIsOrdering(false); 
        console.error(err); 
        alert(`❌ เกิดข้อผิดพลาด: ${err.message}`); 
    }
  };

  const categories = ['Noodles', 'GaoLao', 'Sides'];
  const categoryNames = {'Noodles': '🍜 ก๋วยเตี๋ยว', 'GaoLao': '🍲 เกาเหลา', 'Sides': '🍚 ของทานเล่น'};
  const filteredMenu = useMemo(() => activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory), [menu, activeCategory]);
  const totalItems = cart.length;
  const totalPrice = cart.reduce((sum, item) => sum + item.pricePerUnit, 0);

  // --- UI States (GPS Check) ---
  if (!tableId) return <div className="h-screen flex items-center justify-center text-gray-500 text-xl font-bold bg-gray-50">📷 กรุณาสแกน QR Code ที่โต๊ะนะครับ</div>;
  
  if (locationStatus === 'checking') return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
          <div className="text-4xl animate-bounce mb-4">🛰️</div>
          <h2 className="text-xl font-bold text-gray-800">กำลังตรวจสอบตำแหน่ง...</h2>
          <p className="text-gray-500 mt-2 text-sm">กรุณากด "อนุญาต" เพื่อยืนยันว่าท่านอยู่ที่ร้าน</p>
      </div>
  );

  if (locationStatus === 'denied') return (
      <div className="h-screen flex flex-col items-center justify-center bg-red-50 p-6 text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-red-600">ไม่ได้รับอนุญาตระบุพิกัด</h2>
          <p className="text-gray-600 mt-2">ระบบต้องใช้ GPS เพื่อยืนยันตัวตน</p>
          <button onClick={() => window.location.reload()} className="mt-6 bg-red-600 text-white px-6 py-2 rounded-xl shadow-lg">ลองใหม่อีกครั้ง</button>
      </div>
  );

  if (locationStatus === 'too_far') return (
      <div className="h-screen flex flex-col items-center justify-center bg-orange-50 p-6 text-center">
          <div className="text-4xl mb-4">🏃‍♂️</div>
          <h2 className="text-xl font-bold text-orange-700">ท่านอยู่นอกพื้นที่ร้าน</h2>
          <p className="text-gray-600 mt-2">ห่างจากจุดสั่งอาหาร: <b>{distance} เมตร</b></p>
          <p className="text-sm text-gray-400 mt-1">(ระยะที่กำหนด: {ALLOWED_DISTANCE_METERS} เมตร)</p>
          <button onClick={() => window.location.reload()} className="mt-6 bg-orange-600 text-white px-6 py-2 rounded-xl shadow-lg">ตรวจสอบอีกครั้ง</button>
      </div>
  );

  if (!table) return <div className="h-screen flex items-center justify-center text-gray-400 bg-gray-50">กำลังโหลดเมนู... ⏳</div>;

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-36 max-w-md mx-auto relative font-sans text-gray-800">
      {/* Header */}
      <div className="bg-white px-5 py-4 sticky top-0 z-30 shadow-sm flex justify-between items-end border-b border-gray-100">
          <div>
            <h1 className="text-xl font-extrabold text-gray-800 tracking-tight">ก๋วยเตี๋ยวรสเด็ด 🥢</h1>
            <p className="text-sm text-gray-400 font-medium">โต๊ะ {table.table_number} | <span className="text-green-500">📍 ในร้าน ({distance}ม.)</span></p>
          </div>
      </div>
      
      {/* Category Tabs */}
      <div className="bg-white px-2 py-3 sticky top-[75px] z-20 flex gap-2 justify-center border-b border-gray-100 overflow-x-auto no-scrollbar">
          {categories.map(cat => ( <button key={cat} onClick={() => setActiveCategory(cat)} className={`flex-1 py-2 px-3 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeCategory === cat ? 'bg-orange-500 text-white shadow-md transform scale-105' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{categoryNames[cat]}</button> ))}
      </div>

      {/* Menu List */}
      <div className="p-4 gap-4 flex flex-col">
        {filteredMenu.map((item) => { 
            const sel = getSelection(item.id); 
            const hasSpecial = item.price_special > 0; 
            const showOptions = item.category === 'Noodles' || item.category === 'GaoLao'; 
            const qtyNormal = getQtyInCart(item, 'normal');
            const qtySpecial = getQtyInCart(item, 'special');
            return (
          <div key={item.id} className="bg-white p-5 rounded-2xl shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] border border-gray-50 relative overflow-hidden">
             <div className="flex justify-between items-start mb-3"><div><h3 className="font-bold text-lg text-gray-800">{item.name}</h3><p className="text-xs text-gray-400 mt-1">{categoryNames[item.category]}</p></div><div className="text-right"><span className="block font-bold text-lg text-orange-600">{item.price}.-</span>{hasSpecial && <span className="block text-xs text-orange-400 font-medium">พิเศษ {item.price_special}.-</span>}</div></div>
             {item.category === 'Noodles' && ( <div className="mb-4"><select className="w-full bg-orange-50/50 border border-orange-100 text-gray-700 text-sm rounded-xl p-3 font-medium outline-none focus:ring-2 focus:ring-orange-200 transition-all appearance-none cursor-pointer" value={sel.noodle} onChange={(e) => handleNoodleChange(item.id, e.target.value)}><option value="" disabled>🍜 เลือกเส้นก๋วยเตี๋ยว...</option>{NOODLE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select></div> )}
             {showOptions && ( <div className="mb-4 flex flex-wrap gap-2">{EXTRA_OPTIONS.map((ex) => ( <button key={ex.name} onClick={() => handleExtraToggle(item.id, ex.name)} className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${sel.extras.includes(ex.name) ? 'bg-green-50 border-green-400 text-green-700 font-bold shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>{sel.extras.includes(ex.name) ? '✅' : '+'} {ex.name} {ex.price > 0 && `(+${ex.price})`}</button> ))}</div> )}
             <div className="mb-4 inline-flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleTakeawayToggle(item.id)}><div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${sel.isTakeaway ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-300'}`}>{sel.isTakeaway && <span className="text-white text-[8px]">✓</span>}</div><span className={`text-xs font-medium ${sel.isTakeaway ? 'text-orange-600' : 'text-gray-400'}`}>ใส่ถุงกลับบ้าน 🛍️</span></div>
             <div className="grid grid-cols-2 gap-3 mt-2 pt-3 border-t border-dashed border-gray-100"><div className="flex justify-between items-center pr-2 border-r border-gray-100"><span className="text-sm font-medium text-gray-600">ธรรมดา</span>{qtyNormal > 0 ? (<div className="flex items-center gap-2"><button onClick={()=>removeFromCart(item, 'normal')} className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 text-red-500 font-bold border border-red-100 active:scale-90 transition-transform">-</button><span className="font-bold text-gray-800 w-4 text-center">{qtyNormal}</span><button onClick={()=>addToCart(item, 'normal')} className="w-7 h-7 flex items-center justify-center rounded-full bg-green-50 text-green-600 font-bold border border-green-100 active:scale-90 transition-transform">+</button></div>) : ( <button onClick={()=>addToCart(item, 'normal')} className="bg-gray-100 text-gray-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors">เลือก</button> )}</div>{hasSpecial ? (<div className="flex justify-between items-center pl-2"><span className="text-sm font-medium text-orange-600">พิเศษ</span>{qtySpecial > 0 ? (<div className="flex items-center gap-2"><button onClick={()=>removeFromCart(item, 'special')} className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 text-red-500 font-bold border border-red-100 active:scale-90 transition-transform">-</button><span className="font-bold text-gray-800 w-4 text-center">{qtySpecial}</span><button onClick={()=>addToCart(item, 'special')} className="w-7 h-7 flex items-center justify-center rounded-full bg-green-50 text-green-600 font-bold border border-green-100 active:scale-90 transition-transform">+</button></div>) : ( <button onClick={()=>addToCart(item, 'special')} className="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors">เลือก</button> )}</div>) : ( <div className="flex items-center justify-center text-xs text-gray-300 italic">- ไม่มีพิเศษ -</div> )}</div>
          </div>
        )})}
      </div>

      {/* Floating Bottom Bar */}
      {totalItems > 0 && ( 
        <div className="fixed bottom-0 left-0 w-full p-4 z-40 bg-gradient-to-t from-white via-white/95 to-transparent pt-10">
            <div className="max-w-md mx-auto flex gap-2">
                <button onClick={() => setShowCartDetail(true)} className="flex-1 bg-gray-900 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center hover:bg-gray-800 transition-colors"><div className="flex items-center gap-3"><div className="bg-orange-500 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">{totalItems}</div><span className="font-medium">ดูรายการ</span></div><span className="font-bold text-lg">{totalPrice}.-</span></button>
                <button onClick={handleOrderNow} disabled={isOrdering} className={`px-6 rounded-2xl font-bold text-white shadow-xl transition-all active:scale-95 ${isOrdering ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-400'}`}>{isOrdering ? '...' : 'ส่งครัว 🚀'}</button>
            </div>
        </div> 
      )}

      {/* 🔥 CART MODAL */}
      {showCartDetail && totalItems > 0 && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
              <div className="bg-white w-full max-w-md h-[80vh] sm:h-auto sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-slide-up">
                  <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white rounded-t-3xl sticky top-0 z-10"><h2 className="text-xl font-extrabold text-gray-800">รายการที่เลือก 🛒</h2><button onClick={() => setShowCartDetail(false)} className="bg-gray-100 w-8 h-8 rounded-full text-gray-500 font-bold hover:bg-gray-200">✕</button></div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      {cart.map((item, index) => (
                          <div key={item.uuid} className="flex justify-between items-start pb-4 border-b border-gray-50 last:border-0">
                                  <div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="font-bold text-gray-800 text-lg">#{index + 1} {item.name}</span>{item.variant === 'special' && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">พิเศษ</span>}{item.isTakeaway && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">กลับบ้าน</span>}</div>{item.noodle && item.noodle !== 'none' && <p className="text-sm text-gray-500">เส้น: {item.noodle}</p>}{item.extras.length > 0 && <p className="text-xs text-green-600 mt-1">+{item.extras.join(', ')}</p>}<p className="text-sm font-medium text-gray-400 mt-1">{item.pricePerUnit}.-</p></div>
                                  <div className="flex flex-col items-end gap-2"><button onClick={() => deleteItemFromCartByUUID(item.uuid)} className="text-red-500 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1 transition-colors">🗑️ ลบ</button></div>
                          </div>
                      ))}
                  </div>
                  <div className="p-5 border-t border-gray-100 bg-gray-50 rounded-b-3xl"><div className="flex justify-between items-center mb-4"><span className="text-gray-500 font-medium">ยอดรวมทั้งหมด ({totalItems} รายการ)</span><span className="text-2xl font-black text-orange-600">{totalPrice} บาท</span></div><button onClick={handleOrderNow} disabled={isOrdering} className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform hover:bg-orange-500">{isOrdering ? 'กำลังส่งข้อมูล...' : 'ยืนยันสั่งอาหาร ✅'}</button></div>
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