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

  // --- 1. ระบบเช็คสิทธิ์ (Security Check) ---
  const checkAuth = (tData) => {
    if (!tData) return;
    
    // ดึงกุญแจที่ฝังอยู่ในเครื่องลูกค้า (ถ้ามี)
    const localKey = localStorage.getItem(`session_key_${tData.id}`);
    
    // กฎเหล็ก 3 ข้อ:
    // 1. ถ้าโต๊ะปิดอยู่ -> เตะออกทันที + ลบกุญแจทิ้ง
    if (tData.status === 'available') {
        setIsAuthorized(false);
        localStorage.removeItem(`session_key_${tData.id}`);
        return;
    }

    // 2. ถ้าโต๊ะเปิด แต่กุญแจไม่ตรงกัน (แปลว่าโต๊ะนี้เปิดรับลูกค้าใหม่แล้ว คนนี้คือคนเก่า)
    if (tData.session_key !== localKey) {
        // *จุดตัดสินใจสำคัญ*: สำหรับ QR Code แบบแปะโต๊ะถาวร เราต้องยอมให้ลูกค้ารีเซ็ตตัวเองได้
        // แต่ถ้าจะเอาความปลอดภัยสูงสุด เราจะบังคับให้สแกนใหม่ (ในที่นี้ให้ Auto-update เพื่อความสะดวก แต่ต้องเคลียร์ตะกร้า)
        
        // เคลียร์กุญแจเก่า และรับกุญแจใหม่
        localStorage.setItem(`session_key_${tData.id}`, tData.session_key);
        setCart({}); // ล้างตะกร้าของเก่าทิ้ง กันเนียนสั่งต่อ
        setIsAuthorized(true);
    } 
    // 3. กุญแจตรงกัน -> ผ่าน
    else {
        setIsAuthorized(true);
    }
  };

  useEffect(() => {
    if (!tableId) return;

    // A. โหลดข้อมูลครั้งแรก
    const initData = async () => {
      // ดึงข้อมูลโต๊ะ
      const { data: tData } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
      setTable(tData);
      checkAuth(tData);

      // ดึงเมนู
      const { data: mData } = await supabase.from("restaurant_menus").select("*").eq("is_available", true).order("category");
      if (mData) setMenu(mData);
      setLoading(false);
    };

    initData();

    // B. ระบบยามเฝ้าประตู (Realtime Security Guard) 👮‍♂️
    // ถ้าครัวกด "ปิดโต๊ะ" ปุ๊บ... ลูกค้าต้องเด้งออกทันที!
    const channel = supabase.channel(`table-${tableId}-security`)
      .on(
        'postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'restaurant_tables', filter: `id=eq.${tableId}` }, 
        (payload) => {
           console.log("Status Changed:", payload.new);
           setTable(payload.new);
           checkAuth(payload.new); // เช็คสิทธิ์ใหม่ทันที
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [tableId]);


  // --- Logic ตะกร้าสินค้า (เหมือนเดิม) ---
  const addToCart = (item) => setCart(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  const removeFromCart = (item) => setCart(prev => {
      const newCart = { ...prev };
      if (newCart[item.id] > 1) newCart[item.id]--; else delete newCart[item.id];
      return newCart;
  });

  // --- สั่งอาหาร (เพิ่มการเช็คสิทธิ์ซ้ำก่อนสั่ง) ---
  const placeOrder = async () => {
    // เช็คสิทธิ์ครั้งสุดท้ายก่อนยิงออเดอร์ (กันพวกแอบยิง API)
    const { data: currentTable } = await supabase.from("restaurant_tables").select("status").eq("id", tableId).single();
    if (currentTable.status === 'available') {
        alert("⛔ โต๊ะนี้ถูกปิดแล้วครับ กรุณาติดต่อพนักงาน");
        setIsAuthorized(false);
        return;
    }

    if (totalItems === 0) return;
    if (!confirm(`ยืนยันสั่งอาหาร ${totalItems} รายการ?`)) return;
    
    const orderItems = Object.keys(cart).map(id => {
        const item = menu.find(m => m.id == id);
        return { id: item.id, name: item.name, price: item.price, quantity: cart[id] };
    });
    
    const { error } = await supabase.from('orders').insert([{
        table_number: table.table_number,
        items: orderItems,
        total_price: totalPrice,
        status: 'pending'
    }]);

    if (error) alert("สั่งอาหารไม่สำเร็จ: " + error.message);
    else {
        alert("✅ สั่งอาหารเรียบร้อย! รอสักครู่นะครับ");
        setCart({});
    }
  };

  // Logic การแสดงผล (เหมือนเดิม)
  const categories = useMemo(() => ['All', ...new Set(menu.map(m => m.category || 'Other'))], [menu]);
  const filteredMenu = useMemo(() => activeCategory === 'All' ? menu : menu.filter(m => (m.category || 'Other') === activeCategory), [menu, activeCategory]);
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalPrice = Object.keys(cart).reduce((sum, id) => {
    const item = menu.find(m => m.id == id);
    return sum + (item ? item.price * cart[id] : 0);
  }, 0);

  // --- UI ---
  if (!tableId) return <div className="h-screen flex items-center justify-center text-gray-500">📷 กรุณาสแกน QR Code</div>;
  if (loading) return <div className="h-screen flex items-center justify-center text-orange-500 animate-pulse">⏳ กำลังโหลด...</div>;
  
  // หน้าจอตอนถูกบล็อก (ปิดโต๊ะ)
  if (!isAuthorized) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-100 p-6 text-center animate-fade-in">
        <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <span className="text-5xl">⛔</span>
        </div>
        <h1 className="text-2xl font-black text-gray-800 mb-2">โต๊ะนี้ยังไม่เปิดบริการ</h1>
        <p className="text-gray-500 max-w-xs">หรือบิลเก่าถูกเคลียร์ไปแล้ว<br/>กรุณาแจ้งพนักงานเพื่อเปิดโต๊ะใหม่อีกครั้งครับ</p>
    </div>
  );

  // หน้าสั่งอาหาร (ถ้าผ่านการตรวจสอบ)
  return (
    <div className="min-h-screen bg-gray-100 pb-32 max-w-md mx-auto shadow-xl overflow-hidden relative font-sans">
      {/* Header */}
      <div className="bg-white pt-6 pb-4 px-4 sticky top-0 z-30 shadow-sm border-b">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-orange-600 tracking-tight">🍽️ Bella Cucina</h1>
            <p className="text-sm text-gray-500 font-medium">โต๊ะเบอร์ {table.table_number}</p>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="bg-white px-4 py-3 sticky top-[73px] z-20 shadow-sm overflow-x-auto whitespace-nowrap hide-scrollbar border-b border-gray-100">
        <div className="flex gap-2">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${activeCategory === cat ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {cat === 'Food' ? '🍝 อาหาร' : cat === 'Drink' ? '🥤 เครื่องดื่ม' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu List */}
      <div className="p-4 gap-4 flex flex-col">
        {filteredMenu.map((item) => {
          const quantity = cart[item.id] || 0;
          return (
          <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between gap-4 relative overflow-hidden">
            <div className="flex-1 flex flex-col justify-between py-1">
                <div><h3 className="font-bold text-lg text-gray-800 leading-tight mb-1">{item.name}</h3><p className="text-xs text-gray-400">{item.category}</p></div>
                <div className="flex items-center justify-between mt-4">
                    <span className="text-orange-600 font-black text-xl">{item.price}.-</span>
                    {quantity > 0 ? (
                        <div className="flex items-center bg-orange-50 rounded-full p-1 shadow-sm border border-orange-100">
                            <button onClick={() => removeFromCart(item)} className="w-8 h-8 flex items-center justify-center bg-white text-orange-600 rounded-full font-bold shadow-sm active:scale-90 transition-all">-</button>
                            <span className="w-8 text-center font-bold text-orange-700">{quantity}</span>
                            <button onClick={() => addToCart(item)} className="w-8 h-8 flex items-center justify-center bg-orange-500 text-white rounded-full font-bold shadow-sm active:scale-90 transition-all">+</button>
                        </div>
                    ) : (
                        <button onClick={() => addToCart(item)} className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-1.5 rounded-full text-sm font-bold shadow-sm active:scale-95 transition-all">+ เพิ่ม</button>
                    )}
                </div>
            </div>
            <div className="w-28 h-28 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden shadow-sm relative">
                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" onError={(e) => {e.target.style.display = 'none'}} /> : <div className="w-full h-full flex items-center justify-center text-3xl bg-orange-50 text-orange-300">🍽️</div>}
                {quantity > 0 && <div className="absolute top-2 right-2 bg-orange-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white">{quantity}</div>}
            </div>
          </div>
        )})}
      </div>

      {/* Cart Bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 w-full p-4 z-30 bg-gradient-to-t from-white via-white to-transparent pt-8">
          <div className="max-w-md mx-auto bg-gray-900 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center border-t-2 border-orange-500">
            <div><p className="text-sm text-gray-300 mb-0.5">ในตะกร้า {totalItems} รายการ</p><p className="font-black text-2xl text-orange-400">฿{totalPrice}</p></div>
            <button onClick={placeOrder} className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-3 rounded-xl font-bold text-lg shadow-lg transition-transform active:scale-95 flex items-center gap-2"><span>ยืนยันสั่งเลย</span><span>🚀</span></button>
          </div>
        </div>
      )}
      <style jsx global>{`.hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; } @keyframes fade-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } } .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }`}</style>
    </div>
  );
}

export default function OrderPage() {
  return <Suspense fallback={<div></div>}><OrderPageContent /></Suspense>;
}