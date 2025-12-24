"use client";
import { useEffect, useState, Suspense, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function OrderPageContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");
  
  const [menu, setMenu] = useState([]);
  const [table, setTable] = useState(null);
  const [cart, setCart] = useState({});
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [isProcessing, setIsProcessing] = useState(false); // กันกดย้ำ

  useEffect(() => {
    if (!tableId) return;

    // ระบบดักกด Back (กดกลับแล้วจะรีเฟรชหน้า เพื่อเช็คสถานะใหม่)
    window.history.pushState(null, document.title, window.location.href);
    window.addEventListener('popstate', function (event) {
        window.history.pushState(null, document.title, window.location.href);
        window.location.reload(); 
    });

    const initData = async () => {
      // 1. ดึงข้อมูลโต๊ะล่าสุด
      const { data: tData } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
      setTable(tData);

      // 2. Logic การเข้าใช้งาน (Auto Login) 🚀
      const localKey = localStorage.getItem(`session_key_${tableId}`);

      if (tData.status === 'available') {
          // A. ถ้าโต๊ะว่าง -> ยึดโต๊ะทันที! (สร้างกุญแจส่วนตัว)
          const newKey = Math.random().toString(36).substring(2, 10);
          await supabase.from("restaurant_tables").update({ status: 'occupied', session_key: newKey }).eq("id", tableId);
          localStorage.setItem(`session_key_${tableId}`, newKey);
          setIsAuthorized(true);
      } else if (tData.status === 'occupied') {
          // B. ถ้าโต๊ะไม่ว่าง -> เช็คว่าเป็นเราไหม?
          if (tData.session_key === localKey) {
             setIsAuthorized(true); // เป็นเราเอง (กด refresh) -> เข้าได้
          } else {
             setIsAuthorized(false); // คนอื่นใช้อยู่ -> ห้ามเข้า ⛔
          }
      }

      // 3. โหลดเมนู
      const { data: mData } = await supabase.from("restaurant_menus").select("*").eq("is_available", true).order("category");
      if (mData) setMenu(mData);
      setLoading(false);
    };

    initData();

    // เฝ้าระวังสถานะโต๊ะ (Realtime)
    const channel = supabase.channel(`table-${tableId}-guard`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_tables', filter: `id=eq.${tableId}` }, 
        (payload) => {
           setTable(payload.new);
           // ถ้าจู่ๆ โต๊ะว่าง (Admin เคลียร์ หรือ สั่งเสร็จแล้ว) -> ให้รีโหลดเพื่อเริ่มใหม่
           if (payload.new.status === 'available') {
               window.location.reload();
           }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [tableId]);

  // Logic ตะกร้า
  const addToCart = (item) => setCart(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  const removeFromCart = (item) => setCart(prev => { const newCart = { ...prev }; if (newCart[item.id] > 1) newCart[item.id]--; else delete newCart[item.id]; return newCart; });

  // --- ฟังก์ชันสั่งอาหาร (สั่งปุ๊บ -> รีเซ็ตโต๊ะเป็นว่างทันที) ---
  const placeOrder = async () => {
    if (isProcessing) return;
    if (Object.values(cart).reduce((a, b) => a + b, 0) === 0) return;
    if (!confirm("ยืนยันการสั่งอาหาร?")) return;

    setIsProcessing(true); // ล็อกปุ่มกันกดย้ำ

    const orderItems = Object.keys(cart).map(id => { const m = menu.find(x => x.id == id); return { id: m.id, name: m.name, price: m.price, quantity: cart[id] }; });
    const total = orderItems.reduce((s, i) => s + (i.price * i.quantity), 0);
    
    // 1. บันทึกออเดอร์
    const { error } = await supabase.from('orders').insert([{ table_number: table.table_number, items: orderItems, total_price: total, status: 'pending' }]);
    
    if (!error) { 
        alert("✅ สั่งเรียบร้อย! ขอบคุณครับ");
        
        // 2. ลบกุญแจออกจากเครื่องลูกค้า (เตะตัวเองออก)
        localStorage.removeItem(`session_key_${tableId}`);

        // 3. **สำคัญมาก** สั่งรีเซ็ตโต๊ะเป็น 'ว่าง' (available) เพื่อให้สแกนใหม่ได้
        await supabase.from("restaurant_tables").update({ status: 'available', session_key: null }).eq("id", tableId);

        // 4. รีโหลดหน้า (จะกลับไปเจอหน้า Loading หรือสแกนใหม่)
        window.location.reload(); 
    } else {
        alert("Error: " + error.message);
        setIsProcessing(false);
    }
  };

  const categories = useMemo(() => ['All', ...new Set(menu.map(m => m.category || 'Other'))], [menu]);
  const filteredMenu = useMemo(() => activeCategory === 'All' ? menu : menu.filter(m => (m.category || 'Other') === activeCategory), [menu, activeCategory]);
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalPrice = Object.keys(cart).reduce((sum, id) => { const item = menu.find(m => m.id == id); return sum + (item ? item.price * cart[id] : 0); }, 0);

  // --- UI ---
  if (!tableId) return <div className="h-screen flex items-center justify-center text-gray-500">📷 กรุณาสแกน QR Code</div>;
  if (loading) return <div className="h-screen flex items-center justify-center text-orange-500 animate-pulse">⏳ กำลังตรวจสอบสถานะโต๊ะ...</div>;

  // 🔒 หน้าจอ Block (ถ้ามีคนอื่นใช้อยู่)
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6 text-center animate-fade-in font-sans">
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <span className="text-4xl">⏳</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">โต๊ะไม่ว่าง / กำลังทำรายการ</h1>
          <p className="text-gray-500 max-w-xs text-sm">
            มีลูกค้าท่านอื่นกำลังสั่งอาหารอยู่ครับ<br/>
            กรุณารอสักครู่ แล้วสแกนใหม่อีกครั้ง
          </p>
          <button onClick={() => window.location.reload()} className="mt-8 bg-white border border-gray-300 text-gray-600 px-6 py-2 rounded-full text-sm hover:bg-gray-50">
            ลองสแกนใหม่ 🔄
          </button>
      </div>
    );
  }

  // 🟢 หน้าสั่งอาหาร (ไม่มีรหัสผ่านแล้ว!)
  return (
    <div className="min-h-screen bg-gray-100 pb-32 max-w-md mx-auto shadow-xl overflow-hidden relative font-sans">
      <div className="bg-white pt-6 pb-4 px-4 sticky top-0 z-30 shadow-sm border-b flex justify-between items-center">
         <div><h1 className="text-2xl font-black text-orange-600 tracking-tight">🍽️ Bella Cucina</h1><p className="text-sm text-gray-500 font-medium">โต๊ะเบอร์ {table.table_number}</p></div>
      </div>
      <div className="bg-white px-4 py-3 sticky top-[73px] z-20 shadow-sm overflow-x-auto whitespace-nowrap hide-scrollbar border-b border-gray-100 flex gap-2">
          {categories.map(cat => ( <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${activeCategory === cat ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>{cat === 'Food'?'🍝 อาหาร':cat==='Drink'?'🥤 เครื่องดื่ม':cat}</button> ))}
      </div>
      <div className="p-4 gap-4 flex flex-col">
        {filteredMenu.map((item) => { const qty = cart[item.id] || 0; return (
          <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between gap-4 relative overflow-hidden">
            <div className="flex-1 flex flex-col justify-between py-1">
                <div><h3 className="font-bold text-lg text-gray-800 leading-tight mb-1">{item.name}</h3><p className="text-xs text-gray-400">{item.category}</p></div>
                <div className="flex items-center justify-between mt-4"><span className="text-orange-600 font-black text-xl">{item.price}.-</span>
                    {qty > 0 ? (<div className="flex items-center bg-orange-50 rounded-full p-1 border border-orange-100"><button onClick={() => removeFromCart(item)} className="w-8 h-8 flex items-center justify-center bg-white text-orange-600 rounded-full font-bold shadow-sm">-</button><span className="w-8 text-center font-bold text-orange-700">{qty}</span><button onClick={() => addToCart(item)} className="w-8 h-8 flex items-center justify-center bg-orange-500 text-white rounded-full font-bold shadow-sm">+</button></div>) 
                    : (<button onClick={() => addToCart(item)} className="bg-orange-100 text-orange-700 px-4 py-1.5 rounded-full text-sm font-bold shadow-sm">+ เพิ่ม</button>)}
                </div>
            </div>
            <div className="w-28 h-28 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden shadow-sm relative">{item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>}</div>
          </div>
        )})}
      </div>
      {totalItems > 0 && ( <div className="fixed bottom-0 left-0 w-full p-4 z-30 bg-gradient-to-t from-white via-white to-transparent pt-8"><div className="max-w-md mx-auto bg-gray-900 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center border-t-2 border-orange-500"><div><p className="text-sm text-gray-300 mb-0.5">ในตะกร้า {totalItems} รายการ</p><p className="font-black text-2xl text-orange-400">฿{totalPrice}</p></div><button onClick={placeOrder} disabled={isProcessing} className="bg-orange-500 text-white px-6 py-3 rounded-xl font-bold text-lg shadow-lg flex items-center gap-2 transition-transform active:scale-95 disabled:bg-gray-400"><span>{isProcessing ? 'กำลังส่ง...' : 'ยืนยันสั่งเลย'}</span><span>🚀</span></button></div></div> )}
      <style jsx global>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fade-in 0.5s ease-out; }`}</style>
    </div>
  );
}
export default function OrderPage() { return <Suspense fallback={<div></div>}><OrderPageContent /></Suspense>; }