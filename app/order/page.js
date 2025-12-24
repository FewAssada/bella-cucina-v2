"use client";
import { useEffect, useState, Suspense, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 🍜 รายการเส้น
const NOODLE_OPTIONS = ["เส้นเล็ก", "เส้นใหญ่", "หมี่ขาว", "บะหมี่เหลือง", "มาม่า", "วุ้นเส้น"];

function OrderPageContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");
  
  const [menu, setMenu] = useState([]);
  const [table, setTable] = useState(null);
  // ตะกร้าเก็บ key: "id-variant-noodle"
  const [cart, setCart] = useState({}); 
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Noodles'); // เริ่มที่หน้าก๋วยเตี๋ยว
  // เก็บค่าเส้นที่ลูกค้ากำลังเลือกอยู่ (แยกแต่ละเมนู)
  const [selectedNoodles, setSelectedNoodles] = useState({});

  // Security Logic (เหมือนเดิม)
  const checkAuth = (tData) => {
    if (!tData || sessionEnded) return;
    const localKey = localStorage.getItem(`session_key_${tData.id}`);
    if (tData.status === 'occupied' && tData.session_key === localKey) {
        setIsAuthorized(true);
    } else {
        setIsAuthorized(false);
        if (localKey && tData.session_key !== localKey) handleSessionEnd(tData.id);
    }
  };
  const handleSessionEnd = (tId) => { localStorage.removeItem(`session_key_${tId}`); setIsAuthorized(false); setSessionEnded(true); };

  useEffect(() => {
    if (!tableId) return;
    const initData = async () => {
      const { data: t } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
      setTable(t);
      checkAuth(t);
      const { data: m } = await supabase.from("restaurant_menus").select("*").eq("is_available", true).order("id");
      if (m) setMenu(m);
    };
    initData();
    const channel = supabase.channel(`table-${tableId}-secure`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_tables', filter: `id=eq.${tableId}` }, (payload) => { const tData = payload.new; setTable(tData); if (sessionEnded) return; if (tData.status === 'occupied' && tData.session_key && !localStorage.getItem(`session_key_${tData.id}`)) { localStorage.setItem(`session_key_${tData.id}`, tData.session_key); setIsAuthorized(true); } else { checkAuth(tData); } }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [tableId, sessionEnded]);

  // --- Logic เลือกเส้น ---
  const handleNoodleChange = (itemId, noodle) => {
      setSelectedNoodles(prev => ({ ...prev, [itemId]: noodle }));
  };

  // --- Logic ตะกร้า ---
  const addToCart = (item, variant = 'normal') => {
      // เช็คว่าต้องเลือกเส้นไหม? (หมวด Noodles ต้องเลือก, หมวดอื่นไม่ต้อง)
      let noodle = '';
      if (item.category === 'Noodles') {
          noodle = selectedNoodles[item.id];
          if (!noodle) return alert("กรุณาเลือกเส้นก่อนครับ 🍜");
      }

      const key = `${item.id}-${variant}-${noodle || 'none'}`; // สร้าง Key ไม่ซ้ำกัน
      setCart(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  };

  const removeFromCart = (item, variant = 'normal') => {
      let noodle = '';
      if (item.category === 'Noodles') {
          noodle = selectedNoodles[item.id];
          if (!noodle) return alert("เลือกเส้นที่จะลบออกก่อนครับ");
      }
      const key = `${item.id}-${variant}-${noodle || 'none'}`;
      setCart(prev => { const newCart = { ...prev }; if (newCart[key] > 1) newCart[key]--; else delete newCart[key]; return newCart; });
  };

  const placeOrder = async () => {
    if (sessionEnded) return alert("Session หมดอายุ");
    if (Object.values(cart).reduce((a, b) => a + b, 0) === 0) return;
    
    const items = Object.keys(cart).map(key => {
        const [id, variant, noodle] = key.split('-');
        const m = menu.find(x => x.id == id);
        const finalPrice = variant === 'special' ? m.price_special : m.price;
        
        // สร้างชื่อเมนูแบบเต็ม (เช่น "หมูตุ๋น (พิเศษ) - เส้นเล็ก")
        let fullName = m.name;
        if (noodle && noodle !== 'none') fullName += ` [${noodle}]`;
        if (variant === 'special') fullName += ` (พิเศษ)`;

        return { 
            id: m.id, 
            name: fullName, // ส่งชื่อเต็มไปให้ครัว
            price: finalPrice, 
            quantity: cart[key] 
        };
    });

    const total = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    await supabase.from('orders').insert([{ table_number: table.table_number, items, total_price: total, status: 'pending' }]);
    alert("✅ สั่งเรียบร้อย!");
    setCart({});
  };

  // หมวดหมู่ (แปลไทย)
  const categories = ['Noodles', 'GaoLao', 'Sides'];
  const categoryNames = {'Noodles': '🍜 ก๋วยเตี๋ยว', 'GaoLao': '🍲 เกาเหลา', 'Sides': '🍚 ของทานเล่น/ข้าว'};
  const filteredMenu = useMemo(() => activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory), [menu, activeCategory]);
  
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalPrice = Object.keys(cart).reduce((sum, key) => {
    const [id, variant] = key.split('-');
    const item = menu.find(m => m.id == id);
    if (!item) return sum;
    const price = variant === 'special' ? item.price_special : item.price;
    return sum + (price * cart[key]);
  }, 0);

  if (!tableId) return <div className="h-screen flex items-center justify-center text-gray-500">📷 สแกน QR Code ที่โต๊ะนะครับ</div>;
  if (sessionEnded) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-6 text-center text-white"><h1 className="text-2xl font-bold mb-2">ขอบคุณที่ใช้บริการ</h1><p className="text-gray-400">รายการสิ้นสุดแล้ว</p></div>;
  if (!isAuthorized) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-6 text-center text-white"><div className="animate-pulse text-4xl mb-4">📡</div><h1 className="text-xl font-bold">รอพนักงานเปิดโต๊ะ...</h1></div>;

  return (
    <div className="min-h-screen bg-gray-100 pb-32 max-w-md mx-auto relative font-sans">
      <div className="bg-white p-4 sticky top-0 z-30 shadow-sm flex justify-between items-center">
         <h1 className="text-xl font-black text-orange-600">🍜 ก๋วยเตี๋ยวรสเด็ด <span className="text-gray-400 text-sm font-normal">| โต๊ะ {table.table_number}</span></h1>
      </div>
      
      {/* หมวดหมู่ */}
      <div className="bg-white px-2 py-2 sticky top-[60px] z-20 shadow-sm flex gap-1 justify-center border-b border-gray-100">
          {categories.map(cat => ( 
             <button key={cat} onClick={() => setActiveCategory(cat)} 
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeCategory === cat ? 'bg-orange-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>
                {categoryNames[cat]}
             </button> 
          ))}
      </div>
      
      <div className="p-4 gap-4 flex flex-col">
        {filteredMenu.map((item) => { 
            const currentNoodle = selectedNoodles[item.id] || '';
            // นับจำนวนตามเส้นที่เลือกอยู่
            const qtyNormal = cart[`${item.id}-normal-${currentNoodle || 'none'}`] || 0;
            const qtySpecial = cart[`${item.id}-special-${currentNoodle || 'none'}`] || 0;
            const hasSpecial = item.price_special > 0;

            return (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
             <div className="flex justify-between items-start mb-2">
                <div>
                    <h3 className="font-black text-lg text-gray-800 leading-tight">{item.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">{categoryNames[item.category]}</p>
                </div>
                <div className="text-right">
                    <span className="block font-bold text-gray-800">{item.price}.-</span>
                    {hasSpecial && <span className="block text-xs text-orange-500 font-bold">พิเศษ {item.price_special}.-</span>}
                </div>
             </div>

             {/* Dropdown เลือกเส้น (เฉพาะหมวดก๋วยเตี๋ยว) */}
             {item.category === 'Noodles' && (
                 <div className="mb-3">
                     <select 
                        className="w-full bg-orange-50 border border-orange-200 text-gray-700 text-sm rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-orange-500"
                        value={selectedNoodles[item.id] || ''}
                        onChange={(e) => handleNoodleChange(item.id, e.target.value)}
                     >
                         <option value="" disabled>--- กรุณาเลือกเส้น ---</option>
                         {NOODLE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                     </select>
                 </div>
             )}

             {/* ปุ่มกด */}
             <div className="grid grid-cols-2 gap-2 mt-2">
                {/* ปุ่มธรรมดา */}
                <div className="bg-gray-50 rounded-lg p-2 flex justify-between items-center border border-gray-200">
                    <span className="text-xs font-bold text-gray-600">ธรรมดา</span>
                    {qtyNormal > 0 ? (
                        <div className="flex items-center gap-2">
                            <button onClick={()=>removeFromCart(item, 'normal')} className="text-red-500 font-bold px-1">-</button>
                            <span className="font-bold text-sm">{qtyNormal}</span>
                            <button onClick={()=>addToCart(item, 'normal')} className="text-green-600 font-bold px-1">+</button>
                        </div>
                    ) : (
                        <button onClick={()=>addToCart(item, 'normal')} className="bg-gray-200 text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-300">เลือก</button>
                    )}
                </div>

                {/* ปุ่มพิเศษ */}
                {hasSpecial ? (
                    <div className="bg-orange-50 rounded-lg p-2 flex justify-between items-center border border-orange-200">
                        <span className="text-xs font-bold text-orange-600">พิเศษ</span>
                        {qtySpecial > 0 ? (
                            <div className="flex items-center gap-2">
                                <button onClick={()=>removeFromCart(item, 'special')} className="text-red-500 font-bold px-1">-</button>
                                <span className="font-bold text-sm">{qtySpecial}</span>
                                <button onClick={()=>addToCart(item, 'special')} className="text-green-600 font-bold px-1">+</button>
                            </div>
                        ) : (
                            <button onClick={()=>addToCart(item, 'special')} className="bg-orange-200 text-orange-700 px-3 py-1 rounded text-xs font-bold hover:bg-orange-300">เลือก</button>
                        )}
                    </div>
                ) : (
                    <div className="bg-gray-50 rounded-lg p-2 flex items-center justify-center text-xs text-gray-400 border border-gray-100">
                        - ไม่มีพิเศษ -
                    </div>
                )}
             </div>
          </div>
        )})}
      </div>
      
      {totalItems > 0 && ( <div className="fixed bottom-0 left-0 w-full p-4 z-30 bg-gradient-to-t from-white via-white to-transparent pt-8"><div className="max-w-md mx-auto bg-gray-900 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center"><div><p className="text-sm text-gray-400">รายการ: {totalItems}</p><p className="font-bold text-xl">รวม: {totalPrice} บาท</p></div><button onClick={placeOrder} className="bg-orange-500 px-6 py-2 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-transform">ยืนยันสั่ง 🚀</button></div></div> )}
    </div>
  );
}
export default function OrderPage() { return <Suspense fallback={<div>Loading...</div>}><OrderPageContent /></Suspense>; }