"use client";
import { useEffect, useState, Suspense } from "react";
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
  const [cart, setCart] = useState({}); // { menuId: quantity }
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  // โหลดข้อมูล + เช็คกุญแจ
  useEffect(() => {
    if (!tableId) return;
    const fetchData = async () => {
      // 1. เช็คโต๊ะ
      const { data: tData } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single();
      if (tData) {
        setTable(tData);
        const localKey = localStorage.getItem(`session_key_${tableId}`);
        // Logic เช็คกุญแจ
        if (tData.status === 'available') {
            setIsAuthorized(false);
            localStorage.removeItem(`session_key_${tableId}`);
        } else if (tData.session_key === localKey) {
            setIsAuthorized(true);
        } else if (tData.status === 'occupied' && tData.session_key !== localKey) {
            // กรณีเป็นลูกค้าใหม่ที่เพิ่งสแกน (รับกุญแจ)
            localStorage.setItem(`session_key_${tableId}`, tData.session_key);
            setIsAuthorized(true);
        }
      }

      // 2. โหลดเมนู
      const { data: mData } = await supabase.from("restaurant_menus").select("*").eq("is_available", true).order("category");
      if (mData) setMenu(mData);
      setLoading(false);
    };
    fetchData();
  }, [tableId]);

  // จัดการตะกร้า
  const addToCart = (item) => {
    setCart(prev => ({ ...prev, [item.id]: (prev[item.id] || 0) + 1 }));
  };
  const removeFromCart = (item) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (newCart[item.id] > 1) newCart[item.id]--;
      else delete newCart[item.id];
      return newCart;
    });
  };

  // สั่งอาหาร
  const placeOrder = async () => {
    if (Object.keys(cart).length === 0) return alert("กรุณาเลือกอาหารก่อนครับ");
    
    // แปลงตะกร้าเป็นรายการออเดอร์
    const orderItems = Object.keys(cart).map(id => {
        const item = menu.find(m => m.id == id);
        return { id: item.id, name: item.name, price: item.price, quantity: cart[id] };
    });
    
    const totalPrice = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const { error } = await supabase.from('orders').insert([{
        table_number: table.table_number,
        items: orderItems,
        total_price: totalPrice,
        status: 'pending'
    }]);

    if (error) alert("สั่งอาหารไม่สำเร็จ: " + error.message);
    else {
        alert("สั่งอาหารเรียบร้อย! รอสักครู่นะครับ 🍳");
        setCart({}); // ล้างตะกร้า
    }
  };

  // --- UI ---
  if (!tableId) return <div className="p-10 text-center">📷 กรุณาสแกน QR Code ที่โต๊ะ</div>;
  if (loading) return <div className="p-10 text-center">⏳ กำลังโหลด...</div>;
  if (!isAuthorized) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-100 p-4 text-center">
        <div className="text-6xl mb-4">⛔</div>
        <h1 className="text-2xl font-bold text-gray-800">โต๊ะยังไม่เปิด</h1>
        <p className="text-gray-600">กรุณาแจ้งพนักงานเพื่อเปิดโต๊ะก่อนนะครับ</p>
    </div>
  );

  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-lg font-bold text-gray-800">🍽️ โต๊ะ {table.table_number}</h1>
        {totalItems > 0 && <span className="bg-orange-500 text-white px-2 py-1 rounded-full text-xs">{totalItems} รายการ</span>}
      </div>

      {/* Menu List */}
      <div className="p-4 gap-4 grid grid-cols-1 md:grid-cols-2">
        {menu.map((item) => (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm flex gap-4">
            <div className="w-24 h-24 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">🍲</div>}
            </div>
            <div className="flex-1 flex flex-col justify-between">
                <div>
                    <h3 className="font-bold text-gray-800">{item.name}</h3>
                    <p className="text-gray-400 text-xs">{item.category}</p>
                </div>
                <div className="flex justify-between items-end">
                    <span className="text-orange-600 font-bold text-lg">{item.price}.-</span>
                    {cart[item.id] ? (
                        <div className="flex items-center gap-3 bg-gray-100 rounded-lg px-2 py-1">
                            <button onClick={() => removeFromCart(item)} className="text-red-500 font-bold px-2">-</button>
                            <span className="font-bold">{cart[item.id]}</span>
                            <button onClick={() => addToCart(item)} className="text-green-600 font-bold px-2">+</button>
                        </div>
                    ) : (
                        <button onClick={() => addToCart(item)} className="bg-orange-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm active:scale-95">ใส่ตะกร้า</button>
                    )}
                </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Cart Bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 w-full bg-white border-t p-4 shadow-lg z-20">
            <button onClick={placeOrder} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold text-lg shadow-md hover:bg-green-500 transition-all active:scale-95">
                ยืนยันสั่งอาหาร ({totalItems}) 🚀
            </button>
        </div>
      )}
    </div>
  );
}

export default function OrderPage() {
  return <Suspense fallback={<div>Loading...</div>}><OrderPageContent /></Suspense>;
}