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

// 🥓 รายการเครื่องเคียง / ท็อปปิ้ง (เพิ่มตรงนี้ได้เลย)
const EXTRA_OPTIONS = [
  { name: "เพิ่มลูกชิ้น (3 ลูก)", price: 10 },
  { name: "กากหมูเจียว", price: 10 },
  { name: "เพิ่มผักบุ้ง", price: 5 },
  { name: "ไม่ใส่ถั่วงอก", price: 0 },
  { name: "ไม่ใส่ผักโรย", price: 0 }
];

function OrderPageContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");
  
  const [menu, setMenu] = useState([]);
  const [table, setTable] = useState(null);
  const [cart, setCart] = useState({}); 
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Noodles');

  // เก็บค่าตัวเลือกต่างๆ ของแต่ละเมนู
  const [selections, setSelections] = useState({}); 
  // รูปแบบ: { itemId: { noodle: 'เส้นเล็ก', extras: ['เพิ่มลูกชิ้น', 'ไม่งอก'] } }

  // Security Check (เหมือนเดิม)
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

  // --- Helper Functions จัดการ State ตัวเลือก ---
  const getSelection = (itemId) => selections[itemId] || { noodle: '', extras: [] };

  const handleNoodleChange = (itemId, val) => {
      setSelections(prev => ({ ...prev, [itemId]: { ...getSelection(itemId), noodle: val } }));
  };

  const handleExtraToggle = (itemId, extraName) => {
      const current = getSelection(itemId);
      const newExtras = current.extras.includes(extraName)
          ? current.extras.filter(e => e !== extraName) // เอาออก
          : [...current.extras, extraName]; // เพิ่มเข้า
      setSelections(prev => ({ ...prev, [itemId]: { ...current, extras: newExtras } }));
  };

  // --- Logic ตะกร้าสินค้า ---
  const addToCart = (item, variant = 'normal') => {
      const sel = getSelection(item.id);
      
      // บังคับเลือกเส้น (ถ้าเป็นก๋วยเตี๋ยว)
      if (item.category === 'Noodles' && !sel.noodle) return alert("กรุณาเลือกเส้นก่อนครับ 🍜");

      // สร้าง Key เฉพาะสำหรับสินค้านี้ (รวมท็อปปิ้งด้วย เพื่อให้แยกรายการกัน)
      // เช่น: 1-normal-เส้นเล็ก-เพิ่มลูกชิ้น,กากหมู
      const extrasKey = sel.extras.sort().join(',');
      const cartKey = `${item.id}-${variant}-${sel.noodle || 'none'}-${extrasKey}`; 

      setCart(prev => ({ ...prev, [cartKey]: (prev[cartKey] || 0) + 1 }));
  };

  const removeFromCart = (item, variant = 'normal') => {
      const sel = getSelection(item.id);
      const extrasKey = sel.extras.sort().join(',');
      const cartKey = `${item.id}-${variant}-${sel.noodle || 'none'}-${extrasKey}`;

      if (!cart[cartKey]) return alert("ไม่พบรายการที่ตรงกับตัวเลือกนี้ในตะกร้า");
      
      setCart(prev => { 
          const newCart = { ...prev }; 
          if (newCart[cartKey] > 1) newCart[cartKey]--; 
          else delete newCart[cartKey]; 
          return newCart; 
      });
  };

  const placeOrder = async () => {
    if (sessionEnded) return alert("Session หมดอายุ");
    if (Object.values(cart).reduce((a, b) => a + b, 0) === 0) return;
    
    // แปลงตะกร้าเป็นรายการออเดอร์
    const items = Object.keys(cart).map(key => {
        // key format: id-variant-noodle-extras
        const parts = key.split('-');
        const id = parts[0];
        const variant = parts[1];
        const noodle = parts[2];
        const extrasStr = parts.slice(3).join('-'); // เผื่อชื่อ extra มีขีด
        const extras = extrasStr ? extrasStr.split(',') : [];

        const m = menu.find(x => x.id == id);
        
        // คำนวณราคา (ราคาหลัก + ราคาเครื่องเคียง)
        let finalPrice = variant === 'special' ? m.price_special : m.price;
        let extrasText = "";
        
        extras.forEach(exName => {
            const exOption = EXTRA_OPTIONS.find(e => e.name === exName);
            if (exOption) {
                finalPrice += exOption.price;
                extrasText += ` +${exName}`;
            }
        });

        // สร้างชื่อเมนูแบบเต็มๆ ส่งเข้าครัว
        let fullName = m.name;
        if (noodle && noodle !== 'none') fullName += ` [${noodle}]`;
        if (variant === 'special') fullName += ` (พิเศษ)`;
        if (extrasText) fullName += extrasText;

        return { 
            id: m.id, 
            name: fullName, 
            price: finalPrice, 
            quantity: cart[key] 
        };
    });

    const total = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    await supabase.from('orders').insert([{ table_number: table.table_number, items, total_price: total, status: 'pending' }]);
    alert("✅ สั่งเรียบร้อย!");
    setCart({});
    // รีเซ็ตตัวเลือกหลังจากสั่งเสร็จ (Optional)
    setSelections({});
  };

  const categories = ['Noodles', 'GaoLao', 'Sides'];
  const categoryNames = {'Noodles': '🍜 ก๋วยเตี๋ยว', 'GaoLao': '🍲 เกาเหลา', 'Sides': '🍚 ของทานเล่น/ข้าว'};
  const filteredMenu = useMemo(() => activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory), [menu, activeCategory]);
  
  // คำนวณยอดรวมในตะกร้า (ซับซ้อนขึ้นนิดนึง เพราะต้องบวกค่าท็อปปิ้ง)
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalPrice = Object.keys(cart).reduce((sum, key) => {
    const parts = key.split('-');
    const id = parts[0];
    const variant = parts[1];
    const extrasStr = parts.slice(3).join('-');
    const extras = extrasStr ? extrasStr.split(',') : [];

    const item = menu.find(m => m.id == id);
    if (!item) return sum;

    let pricePerUnit = variant === 'special' ? item.price_special : item.price;
    extras.forEach(exName => {
        const exOption = EXTRA_OPTIONS.find(e => e.name === exName);
        if (exOption) pricePerUnit += exOption.price;
    });

    return sum + (pricePerUnit * cart[key]);
  }, 0);

  if (!tableId) return <div className="h-screen flex items-center justify-center text-gray-500">📷 สแกน QR Code ที่โต๊ะนะครับ</div>;
  if (sessionEnded) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-6 text-center text-white"><h1 className="text-2xl font-bold mb-2">ขอบคุณที่ใช้บริการ</h1><p className="text-gray-400">รายการสิ้นสุดแล้ว</p></div>;
  if (!isAuthorized) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-6 text-center text-white"><div className="animate-pulse text-4xl mb-4">📡</div><h1 className="text-xl font-bold">รอพนักงานเปิดโต๊ะ...</h1></div>;

  return (
    <div className="min-h-screen bg-gray-100 pb-32 max-w-md mx-auto relative font-sans">
      <div className="bg-white p-4 sticky top-0 z-30 shadow-sm flex justify-between items-center">
         <h1 className="text-xl font-black text-orange-600">🍜 ก๋วยเตี๋ยวรสเด็ด <span className="text-gray-400 text-sm font-normal">| โต๊ะ {table.table_number}</span></h1>
      </div>
      
      <div className="bg-white px-2 py-2 sticky top-[60px] z-20 shadow-sm flex gap-1 justify-center border-b border-gray-100">
          {categories.map(cat => ( <button key={cat} onClick={() => setActiveCategory(cat)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeCategory === cat ? 'bg-orange-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>{categoryNames[cat]}</button> ))}
      </div>
      
      <div className="p-4 gap-4 flex flex-col">
        {filteredMenu.map((item) => { 
            const sel = getSelection(item.id);
            const extrasKey = sel.extras.sort().join(',');
            // เช็คตะกร้า: ต้องตรงทั้ง ID, Variant, เส้น, และ ท็อปปิ้ง ถึงจะนับว่าเป็นตัวเดียวกัน
            const cartKeyNormal = `${item.id}-normal-${sel.noodle || 'none'}-${extrasKey}`;
            const cartKeySpecial = `${item.id}-special-${sel.noodle || 'none'}-${extrasKey}`;
            
            const qtyNormal = cart[cartKeyNormal] || 0;
            const qtySpecial = cart[cartKeySpecial] || 0;
            const hasSpecial = item.price_special > 0;
            const showOptions = item.category === 'Noodles' || item.category === 'GaoLao'; // โชว์ท็อปปิ้งเฉพาะเตี๋ยว/เกาเหลา

            return (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
             <div className="flex justify-between items-start mb-2">
                <div><h3 className="font-black text-lg text-gray-800 leading-tight">{item.name}</h3><p className="text-xs text-gray-400 mt-1">{categoryNames[item.category]}</p></div>
                <div className="text-right">
                    <span className="block font-bold text-gray-800">{item.price}.-</span>
                    {hasSpecial && <span className="block text-xs text-orange-500 font-bold">พิเศษ {item.price_special}.-</span>}
                </div>
             </div>

             {/* 1. เลือกเส้น */}
             {item.category === 'Noodles' && (
                 <div className="mb-3">
                     <select className="w-full bg-orange-50 border border-orange-200 text-gray-700 text-sm rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-orange-500"
                        value={sel.noodle} onChange={(e) => handleNoodleChange(item.id, e.target.value)}>
                         <option value="" disabled>--- กรุณาเลือกเส้น ---</option>
                         {NOODLE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                     </select>
                 </div>
             )}

             {/* 2. เลือกเครื่องเคียง (Checkbox) */}
             {showOptions && (
                 <div className="mb-3 flex flex-wrap gap-2">
                    {EXTRA_OPTIONS.map((ex) => (
                        <button 
                            key={ex.name}
                            onClick={() => handleExtraToggle(item.id, ex.name)}
                            className={`px-3 py-1 rounded-full text-xs border transition-all ${
                                sel.extras.includes(ex.name) 
                                ? 'bg-green-100 border-green-500 text-green-700 font-bold' 
                                : 'bg-white border-gray-300 text-gray-500'
                            }`}
                        >
                            {sel.extras.includes(ex.name) ? '✅' : '+'} {ex.name} {ex.price > 0 && `(+${ex.price})`}
                        </button>
                    ))}
                 </div>
             )}

             {/* 3. ปุ่มกดเลือก */}
             <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-dashed">
                <div className="flex justify-between items-center pr-2 border-r border-gray-100">
                    <span className="text-xs font-bold text-gray-600">ธรรมดา</span>
                    {qtyNormal > 0 ? (
                        <div className="flex items-center gap-1 bg-gray-100 rounded-full px-1">
                            <button onClick={()=>removeFromCart(item, 'normal')} className="text-red-500 font-bold px-2">-</button>
                            <span className="font-bold text-sm">{qtyNormal}</span>
                            <button onClick={()=>addToCart(item, 'normal')} className="text-green-600 font-bold px-2">+</button>
                        </div>
                    ) : ( <button onClick={()=>addToCart(item, 'normal')} className="bg-gray-200 text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-300">เลือก</button> )}
                </div>

                {hasSpecial ? (
                    <div className="flex justify-between items-center pl-2">
                        <span className="text-xs font-bold text-orange-600">พิเศษ</span>
                        {qtySpecial > 0 ? (
                            <div className="flex items-center gap-1 bg-orange-50 rounded-full px-1 border border-orange-100">
                                <button onClick={()=>removeFromCart(item, 'special')} className="text-red-500 font-bold px-2">-</button>
                                <span className="font-bold text-sm">{qtySpecial}</span>
                                <button onClick={()=>addToCart(item, 'special')} className="text-green-600 font-bold px-2">+</button>
                            </div>
                        ) : ( <button onClick={()=>addToCart(item, 'special')} className="bg-orange-200 text-orange-700 px-3 py-1 rounded text-xs font-bold hover:bg-orange-300">เลือก</button> )}
                    </div>
                ) : ( <div className="flex items-center justify-center text-xs text-gray-300">- ไม่มีพิเศษ -</div> )}
             </div>
          </div>
        )})}
      </div>
      
      {totalItems > 0 && ( <div className="fixed bottom-0 left-0 w-full p-4 z-30 bg-gradient-to-t from-white via-white to-transparent pt-8"><div className="max-w-md mx-auto bg-gray-900 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center"><div><p className="text-sm text-gray-400">รายการ: {totalItems}</p><p className="font-bold text-xl">รวม: {totalPrice} บาท</p></div><button onClick={placeOrder} className="bg-orange-500 px-6 py-2 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-transform">ยืนยันสั่ง 🚀</button></div></div> )}
    </div>
  );
}
export default function OrderPage() { return <Suspense fallback={<div>Loading...</div>}><OrderPageContent /></Suspense>; }