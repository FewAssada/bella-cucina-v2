// @ts-nocheck
// app/order/page.js
"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function OrderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tableId = searchParams.get("table") || "1";
  
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [showCartDetail, setShowCartDetail] = useState(false);
  const [isTableActive, setIsTableActive] = useState(true);
  const [sessionValid, setSessionValid] = useState(true); // สถานะว่ารหัสลับตรงไหม

  useEffect(() => {
    // ฟังก์ชันเช็คสิทธิ์ (สำคัญมาก)
    const checkSession = async () => {
      // ดึงข้อมูลโต๊ะล่าสุดจาก Server
      const { data: tableData } = await supabase.from('restaurant_tables').select('is_active, session_token').eq('table_number', tableId).single();
      
      if (!tableData) return;
      setIsTableActive(tableData.is_active);

      // ถ้าโต๊ะเปิดอยู่...
      if (tableData.is_active) {
         const localToken = localStorage.getItem(`session_table_${tableId}`);
         const serverToken = tableData.session_token;

         // กรณีที่ 1: ลูกค้าใหม่ (ในเครื่องยังไม่มีรหัส) -> ให้สิทธิ์ทันที
         if (!localToken) {
            localStorage.setItem(`session_table_${tableId}`, serverToken);
            setSessionValid(true);
         } 
         // กรณีที่ 2: ลูกค้าเก่า (รหัสในเครื่อง ไม่ตรงกับ Server) -> บล็อก
         else if (localToken !== serverToken) {
            setSessionValid(false);
         }
         // กรณีที่ 3: ตรงกัน -> ผ่าน
         else {
            setSessionValid(true);
         }
      }
    };

    checkSession();
    
    // โหลดเมนู
    const fetchMenu = async () => {
      const { data } = await supabase.from('menu_items').select('*').eq('is_active', true).order('id');
      if (data) setMenu(data);
    };
    fetchMenu();

    // Realtime Monitor (ถ้าครัวปิดโต๊ะ หรือ รีเซ็ตโต๊ะ ให้เช็คใหม่)
    const channel = supabase.channel('table-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_tables', filter: `table_number=eq.${tableId}` }, 
      (payload) => {
         setIsTableActive(payload.new.is_active);
         // เช็ค Token อีกรอบแบบ Realtime
         const localToken = localStorage.getItem(`session_table_${tableId}`);
         if (payload.new.is_active && localToken && localToken !== payload.new.session_token) {
             setSessionValid(false); // โดนเตะออกแบบ Realtime
         }
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [tableId]);

  const handleGoHome = () => {
    const pin = prompt("รหัสผ่านพนักงาน (Admin Only):");
    if (pin === "45698") router.push("/");
  };

  const addToCart = (item) => {
    if (!isTableActive || !sessionValid) return;
    const existing = cart.find(x => x.id === item.id);
    if (existing) setCart(cart.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x));
    else setCart([...cart, { ...item, qty: 1 }]);
  };

  const submitOrder = async () => {
    // Double Check ก่อนส่ง (กันเหนียว)
    const { data: checkTable } = await supabase.from('restaurant_tables').select('is_active, session_token').eq('table_number', tableId).single();
    const localToken = localStorage.getItem(`session_table_${tableId}`);

    if (!checkTable || !checkTable.is_active) { alert("⛔ โต๊ะนี้ปิดบริการแล้วครับ"); setIsTableActive(false); return; }
    if (localToken !== checkTable.session_token) { alert("⛔ เซสชั่นของคุณหมดอายุแล้ว (มีการเปิดโต๊ะรับลูกค้าใหม่)"); setSessionValid(false); return; }

    if (cart.length === 0) return;
    const note = prompt("หมายเหตุถึงครัว (ถ้ามี):") || "";
    const total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
    const itemsText = cart.map(i => `${i.name} (@${i.price}) x${i.qty}`).join("\n");

    const { error } = await supabase.from('orders').insert({
      table_number: tableId, items: itemsText, total_price: total, status: 'pending', customer_name: 'ลูกค้า', special_req: note
    });

    if (!error) { alert("✅ ส่งออเดอร์สำเร็จ!"); setCart([]); setShowCartDetail(false); } 
    else { alert("❌ เกิดข้อผิดพลาด: " + error.message); }
  };

  const totalAmount = cart.reduce((s, i) => s + (i.price * i.qty), 0);

  // --- UI กรณีโดนบล็อก (ลูกค้าเก่า) ---
  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-[#e8edf7] flex flex-col items-center justify-center p-6 text-center font-sans">
         <div className="text-6xl mb-4">🚫</div>
         <h1 className="text-2xl font-bold text-[#f87171] mb-2">เซสชั่นหมดอายุ</h1>
         <p className="text-gray-400">มีการเปิดโต๊ะสำหรับลูกค้าท่านใหม่แล้ว</p>
         <p className="text-sm text-gray-500 mt-4">หากคุณคือลูกค้าใหม่ กรุณาปิดหน้านี้แล้วสแกน QR Code ใหม่อีกครั้ง</p>
         <button onClick={() => { localStorage.removeItem(`session_table_${tableId}`); window.location.reload(); }} className="mt-8 bg-white/10 px-4 py-2 rounded-lg text-sm hover:bg-white/20">
            ฉันคือลูกค้าใหม่ (รีเซ็ตเครื่อง)
         </button>
      </div>
    );
  }

  // --- UI กรณีโต๊ะปิด ---
  if (!isTableActive) {
    return (
      <div className="min-h-screen bg-[#0b1220] text-[#e8edf7] flex flex-col items-center justify-center p-6 text-center font-sans">
         <div className="text-6xl mb-4">😴</div>
         <h1 className="text-3xl font-bold text-[#f87171] mb-2">โต๊ะนี้ยังไม่เปิด</h1>
         <p className="text-gray-400">กรุณาแจ้งพนักงานเพื่อเปิดโต๊ะ</p>
         <button onClick={handleGoHome} className="mt-10 text-xs text-gray-700 underline">พนักงาน: กลับหน้าหลัก</button>
      </div>
    );
  }

  // --- หน้าเมนูปกติ (ผ่านฉลุย) ---
  return (
    <div className="min-h-screen bg-[#0b1220] text-[#e8edf7] pb-24 font-sans animate-in fade-in">
      <header className="sticky top-0 z-20 bg-[#0b1220]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
           <button onClick={handleGoHome} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs hover:bg-white/20 transition-colors">🏠</button>
           <div>
              <div className="text-xs text-[#a9b4c7]">สั่งอาหารโต๊ะ</div>
              <div className="font-bold text-xl text-[#ffd166]">{tableId}</div>
           </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 grid gap-4">
        {menu.map((item) => (
          <div key={item.id} className="bg-[#111a2e] rounded-xl p-4 flex justify-between items-center border border-white/5 shadow-sm">
            <div>
              <div className="font-semibold text-lg">{item.name}</div>
              <div className="text-sm text-[#a9b4c7]">{item.description}</div>
              <div className="font-bold text-[#2dd4bf] mt-1">{item.price} บาท</div>
            </div>
            <button onClick={() => addToCart(item)} className="bg-white/10 hover:bg-[#9bd5ff] hover:text-black text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">+ เพิ่ม</button>
          </div>
        ))}
      </main>

      <div className={`fixed bottom-0 left-0 right-0 bg-[#111a2e] border-t border-white/10 p-4 transition-transform duration-300 ${cart.length > 0 ? 'translate-y-0' : 'translate-y-full'}`}>
         <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-4">
               <div className="text-sm text-[#a9b4c7]">{cart.reduce((s,i)=>s+i.qty,0)} รายการ</div>
               <button onClick={() => setShowCartDetail(!showCartDetail)} className="text-[#9bd5ff] text-sm underline">ดูรายการ</button>
            </div>
            {showCartDetail && (
              <div className="mb-4 max-h-40 overflow-y-auto bg-black/20 rounded-lg p-2 text-sm">
                 {cart.map(i => (
                   <div key={i.id} className="flex justify-between py-1 border-b border-white/5 last:border-0">
                     <span>{i.name} (@{i.price})</span>
                     <span>x{i.qty} ({i.price * i.qty})</span>
                   </div>
                 ))}
              </div>
            )}
            <div className="flex gap-3 items-center">
               <div className="font-bold text-xl text-[#2dd4bf] mr-auto">{totalAmount} ฿</div>
               <button onClick={() => setCart([])} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[#a9b4c7]">ล้าง</button>
               <button onClick={submitOrder} className="flex-1 py-3 rounded-xl font-bold text-black bg-[#9bd5ff] hover:opacity-90">ยืนยันการสั่ง</button>
            </div>
         </div>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-white">Loading...</div>}>
      <OrderContent />
    </Suspense>
  );
}