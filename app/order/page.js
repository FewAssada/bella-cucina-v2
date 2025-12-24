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
  const [sessionEnded, setSessionEnded] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');

  // ตรวจสอบสิทธิ์ (Security Core)
  const checkAuth = (tData) => {
    if (!tData || sessionEnded) return;
    const localKey = localStorage.getItem(`session_key_${tData.id}`);

    if (tData.status === 'occupied' && tData.session_key === localKey) {
        setIsAuthorized(true);
    } else {
        setIsAuthorized(false);
        // ถ้าเรามีกุญแจ แต่กุญแจโต๊ะเปลี่ยนไปแล้ว หรือโต๊ะปิด -> จบงาน
        if (localKey && tData.session_key !== localKey) {
            handleSessionEnd(tData.id);
        }
    }
  };

  const handleSessionEnd = (tId) => {
      localStorage.removeItem(`session_key_${tId}`);
      setIsAuthorized(false);
      setSessionEnded(true);
  };

  useEffect(() => {
    if (!tableId) return;
    
    const initData = async () => {
      const { data: t } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
      setTable(t);
      checkAuth(t);
      const { data: m } = await supabase.from("restaurant_menus").select("*").eq("is_available", true).order("category");
      if (m) setMenu(m);
    };
    initData();

    // Realtime Listener
    const channel = supabase.channel(`table-${tableId}-secure`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_tables', filter: `id=eq.${tableId}` }, 
        (payload) => {
           const tData = payload.new;
           setTable(tData);

           if (sessionEnded) return;

           // กรณี: ได้รับกุญแจใหม่ (Auto-Auth จากห้องพักคอย)
           if (tData.status === 'occupied' && tData.session_key && !localStorage.getItem(`session_key_${tData.id}`)) {
               localStorage.setItem(`session_key_${tData.id}`, tData.session_key);
               setIsAuthorized(true);
           } else {
               checkAuth(tData);
           }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tableId, sessionEnded]);

  // Logic สั่งอาหาร
  const addToCart = (item) => setCart(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  const removeFromCart = (item) => setCart(prev => { const newCart = { ...prev }; if (newCart[item.id] > 1) newCart[item.id]--; else delete newCart[item.id]; return newCart; });
  const placeOrder = async () => {
    if (sessionEnded) return alert("Session หมดอายุ");
    if (Object.values(cart).reduce((a, b) => a + b, 0) === 0) return;
    const items = Object.keys(cart).map(id => { const m = menu.find(x => x.id == id); return { id: m.id, name: m.name, price: m.price, quantity: cart[id] }; });
    const total = items.reduce((s, i) => s + (i.price * i.quantity), 0);
    await supabase.from('orders').insert([{ table_number: table.table_number, items, total_price: total, status: 'pending' }]);
    alert("✅ สั่งเรียบร้อย!");
    setCart({});
  };

  const categories = useMemo(() => ['All', ...new Set(menu.map(m => m.category || 'Other'))], [menu]);
  const filteredMenu = useMemo(() => activeCategory === 'All' ? menu : menu.filter(m => (m.category || 'Other') === activeCategory), [menu, activeCategory]);
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalPrice = Object.keys(cart).reduce((sum, id) => { const item = menu.find(m => m.id == id); return sum + (item ? item.price * cart[id] : 0); }, 0);

  if (!tableId) return <div className="h-screen flex items-center justify-center text-gray-500">📷 สแกน QR Code ที่โต๊ะนะครับ</div>;

  // Screen 1: จบงานแล้ว
  if (sessionEnded) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-6 text-center font-sans animate-fade-in">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/50"><span className="text-4xl">🙏</span></div>
            <h1 className="text-2xl font-black text-white mb-2">ขอบคุณที่ใช้บริการ</h1>
            <p className="text-gray-400 mb-8">รายการของคุณสิ้นสุดแล้ว<br/>หากต้องการสั่งเพิ่ม กรุณาสแกนใหม่</p>
        </div>
      );
  }

  // Screen 2: ห้องพักคอย (Waiting Room)
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-6 text-center font-sans animate-fade-in">
         <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-red-500 animate-loading-bar"></div>
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6"><span className="text-4xl animate-pulse">📡</span></div>
            <h1 className="text-2xl font-black text-gray-800 mb-2">โต๊ะ {table?.table_number}</h1>
            <p className="text-gray-500 font-medium mb-6">กรุณารอพนักงานเปิดโต๊ะ...</p>
            <div className="bg-gray-100 rounded-xl p-4 text-xs text-gray-400">เมื่อพนักงานอนุมัติ ระบบจะเข้าสู่หน้าเมนูอัตโนมัติ</div>
         </div>
         <style jsx>{`@keyframes loading-bar { 0% { width: 0%; } 50% { width: 70%; } 100% { width: 100%; } } .animate-loading-bar { animation: loading-bar 2s infinite ease-in-out; }`}</style>
      </div>
    );
  }

  // Screen 3: หน้าสั่งอาหาร (Main)
  return (
    <div className="min-h-screen bg-gray-100 pb-32 max-w-md mx-auto relative font-sans">
      <div className="bg-white p-4 sticky top-0 z-30 shadow-sm flex justify-between items-center">
         <h1 className="text-xl font-black text-orange-600">🍽️ Bella Cucina <span className="text-gray-400 text-sm font-normal">| โต๊ะ {table.table_number}</span></h1>
      </div>
      <div className="bg-white px-4 py-2 sticky top-[60px] z-20 shadow-sm overflow-x-auto whitespace-nowrap flex gap-2">
          {categories.map(cat => ( <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-1 rounded-full text-sm font-bold ${activeCategory === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{cat}</button> ))}
      </div>
      <div className="p-4 gap-4 flex flex-col">
        {filteredMenu.map((item) => { const qty = cart[item.id] || 0; return (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm flex justify-between gap-4">
            <div className="flex-1">
                <h3 className="font-bold text-gray-800">{item.name}</h3>
                <div className="flex items-center justify-between mt-2"><span className="text-orange-600 font-bold text-lg">{item.price}.-</span>
                    {qty > 0 ? (<div className="flex items-center gap-3"><button onClick={() => removeFromCart(item)} className="text-red-500 font-bold bg-red-50 w-8 h-8 rounded-full">-</button><span className="font-bold">{qty}</span><button onClick={() => addToCart(item)} className="text-green-600 font-bold bg-green-50 w-8 h-8 rounded-full">+</button></div>) 
                    : (<button onClick={() => addToCart(item)} className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-bold">+ เพิ่ม</button>)}
                </div>
            </div>
            {item.image_url && <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden"><img src={item.image_url} className="w-full h-full object-cover"/></div>}
          </div>
        )})}
      </div>
      {totalItems > 0 && ( <div className="fixed bottom-0 left-0 w-full p-4 z-30 bg-gradient-to-t from-white via-white to-transparent pt-8"><div className="max-w-md mx-auto bg-gray-900 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center"><div><p className="text-sm text-gray-400">รายการ: {totalItems}</p><p className="font-bold text-xl">รวม: {totalPrice} บาท</p></div><button onClick={placeOrder} className="bg-orange-500 px-6 py-2 rounded-xl font-bold text-white shadow-lg">ยืนยันสั่ง 🚀</button></div></div> )}
    </div>
  );
}

export default function OrderPage() { return <Suspense fallback={<div>Loading...</div>}><OrderPageContent /></Suspense>; }