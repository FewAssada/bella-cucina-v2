"use client";
import { useEffect, useState, Suspense, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

// ⚠️ ใส่เบอร์พร้อมเพย์ร้าน
const SHOP_PROMPTPAY_ID = "0812345678"; 

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

function OrderPageContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");
  
  const [menu, setMenu] = useState([]);
  const [table, setTable] = useState(null);
  const [cart, setCart] = useState({}); 
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Noodles');
  const [selections, setSelections] = useState({});
  const [userLocation, setUserLocation] = useState(null);

  // Payment States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [slipFile, setSlipFile] = useState(null); // 🔥 เก็บไฟล์ที่ลูกค้าเลือก

  // ... (ส่วน Security Check และ GPS เหมือนเดิม ย่อไว้นะครับ) ...
  const checkAuth = (tData) => { if (!tData || sessionEnded) return; const localKey = localStorage.getItem(`session_key_${tData.id}`); if (tData.status === 'occupied' && tData.session_key === localKey) { setIsAuthorized(true); } else { setIsAuthorized(false); if (localKey && tData.session_key !== localKey) handleSessionEnd(tData.id); } };
  const handleSessionEnd = (tId) => { localStorage.removeItem(`session_key_${tId}`); setIsAuthorized(false); setSessionEnded(true); };
  useEffect(() => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }), (err) => console.error("GPS Error:", err)); } }, []);
  useEffect(() => { if (!tableId) return; const initData = async () => { const { data: t } = await supabase.from("restaurant_tables").select("*").eq("id", tableId).single(); setTable(t); checkAuth(t); const { data: m } = await supabase.from("restaurant_menus").select("*").eq("is_available", true).order("id"); if (m) setMenu(m); }; initData(); const channel = supabase.channel(`table-${tableId}-secure`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'restaurant_tables', filter: `id=eq.${tableId}` }, (payload) => { const tData = payload.new; setTable(tData); if (sessionEnded) return; if (tData.status === 'occupied' && tData.session_key && !localStorage.getItem(`session_key_${tData.id}`)) { localStorage.setItem(`session_key_${tData.id}`, tData.session_key); setIsAuthorized(true); } else { checkAuth(tData); } }).subscribe(); return () => supabase.removeChannel(channel); }, [tableId, sessionEnded]);
  
  // Helper Functions
  const getSelection = (itemId) => selections[itemId] || { noodle: '', extras: [], isTakeaway: false };
  const handleNoodleChange = (itemId, val) => { setSelections(prev => ({ ...prev, [itemId]: { ...getSelection(itemId), noodle: val } })); };
  const handleExtraToggle = (itemId, extraName) => { const current = getSelection(itemId); const newExtras = current.extras.includes(extraName) ? current.extras.filter(e => e !== extraName) : [...current.extras, extraName]; setSelections(prev => ({ ...prev, [itemId]: { ...current, extras: newExtras } })); };
  const handleTakeawayToggle = (itemId) => { const current = getSelection(itemId); setSelections(prev => ({ ...prev, [itemId]: { ...current, isTakeaway: !current.isTakeaway } })); };
  const addToCart = (item, variant = 'normal') => { const sel = getSelection(item.id); if (item.category === 'Noodles' && !sel.noodle) return alert("กรุณาเลือกเส้นก่อนครับ 🍜"); const extrasKey = sel.extras.sort().join(','); const cartKey = `${item.id}-${variant}-${sel.noodle || 'none'}-${extrasKey}-${sel.isTakeaway ? 'takeaway' : 'dinein'}`; setCart(prev => ({ ...prev, [cartKey]: (prev[cartKey] || 0) + 1 })); };
  const removeFromCart = (item, variant = 'normal') => { const sel = getSelection(item.id); const extrasKey = sel.extras.sort().join(','); const cartKey = `${item.id}-${variant}-${sel.noodle || 'none'}-${extrasKey}-${sel.isTakeaway ? 'takeaway' : 'dinein'}`; if (!cart[cartKey]) return alert("ไม่พบรายการนี้"); setCart(prev => { const newCart = { ...prev }; if (newCart[cartKey] > 1) newCart[cartKey]--; else delete newCart[cartKey]; return newCart; }); };

  const preparePayment = async () => {
      if (sessionEnded) return alert("Session หมดอายุ");
      if (Object.values(cart).reduce((a, b) => a + b, 0) === 0) return;
      
      const amount = Object.keys(cart).reduce((sum, key) => {
        const parts = key.split('-'); parts.pop(); const extrasStr = parts.slice(3).join('-'); const [id, variant] = parts;
        const item = menu.find(m => m.id == id); if (!item) return sum;
        let price = variant === 'special' ? item.price_special : item.price;
        const extras = extrasStr ? extrasStr.split(',') : [];
        extras.forEach(exName => { const exOption = EXTRA_OPTIONS.find(e => e.name === exName); if (exOption) price += exOption.price; });
        return sum + (price * cart[key]);
      }, 0);

      // ✅ ใช้ยอดเป๊ะๆ (ไม่ต้องบวกเศษสตางค์ เพราะเรามีสลิปให้ดูแล้ว)
      const finalAmount = amount; 

      try {
        const payload = generatePayload(SHOP_PROMPTPAY_ID, { amount: finalAmount });
        const url = await QRCode.toDataURL(payload);
        setQrCodeUrl(url);
        setShowPaymentModal(true);
      } catch (err) { alert("QR Error: " + err.message); }
  };

  const confirmPaymentAndOrder = async () => {
    // 🔥 1. บังคับแนบสลิป
    if (!slipFile) return alert("กรุณาแนบสลิปโอนเงินก่อนครับ 📎");

    setIsUploading(true);

    try {
        // 🔥 2. อัปโหลดรูปลง Supabase
        const fileExt = slipFile.name.split('.').pop();
        const fileName = `slip-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('slips') // ต้องตรงกับชื่อ Bucket ที่สร้าง
            .upload(fileName, slipFile);

        if (uploadError) throw new Error("อัปโหลดสลิปไม่สำเร็จ: " + uploadError.message);

        // 🔥 3. ขอลิ้งค์รูป (Public URL)
        const { data: urlData } = supabase.storage.from('slips').getPublicUrl(fileName);
        const slipPublicUrl = urlData.publicUrl;

        // เตรียมข้อมูลออเดอร์
        const items = Object.keys(cart).map(key => {
            const parts = key.split('-'); const type = parts.pop(); const extrasStr = parts.slice(3).join('-'); const [id, variant, noodle] = parts;
            const extras = extrasStr ? extrasStr.split(',') : [];
            const m = menu.find(x => x.id == id);
            let finalPrice = variant === 'special' ? m.price_special : m.price;
            let extrasText = "";
            extras.forEach(exName => { const exOption = EXTRA_OPTIONS.find(e => e.name === exName); if (exOption) { finalPrice += exOption.price; extrasText += ` +${exName}`; } });
            let fullName = m.name;
            if (noodle && noodle !== 'none') fullName += ` [${noodle}]`;
            if (variant === 'special') fullName += ` (พิเศษ)`;
            if (extrasText) fullName += extrasText;
            return { id: m.id, name: fullName, price: finalPrice, quantity: cart[key], is_takeaway: type === 'takeaway' };
        });

        const total = items.reduce((s, i) => s + (i.price * i.quantity), 0);

        // 🔥 4. บันทึกออเดอร์ + ลิ้งค์สลิป
        const { error: dbError } = await supabase.from('orders').insert([{ 
            table_number: table.table_number, 
            items, 
            total_price: total, 
            status: 'pending', 
            payment_status: 'paid_slip_attached', // แจ้งครัวว่า "แนบสลิปแล้วนะ"
            slip_url: slipPublicUrl,              // เก็บลิ้งค์รูปไว้ให้ครัวกดดู
            order_type: 'dine_in',
            location_lat: userLocation?.lat || null,
            location_lng: userLocation?.lng || null
        }]);

        if (dbError) throw dbError;

        setIsUploading(false);
        setShowPaymentModal(false);
        setSlipFile(null); // เคลียร์ไฟล์
        alert("✅ ส่งออเดอร์เรียบร้อย! ขอบคุณครับ");
        setCart({});
        setSelections({});

    } catch (err) {
        setIsUploading(false);
        console.error(err);
        alert(`❌ เกิดข้อผิดพลาด: ${err.message}`);
    }
  };

  // ... (ส่วน UI Menu เหมือนเดิม) ...
  const categories = ['Noodles', 'GaoLao', 'Sides'];
  const categoryNames = {'Noodles': '🍜 ก๋วยเตี๋ยว', 'GaoLao': '🍲 เกาเหลา', 'Sides': '🍚 ของทานเล่น/ข้าว'};
  const filteredMenu = useMemo(() => activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory), [menu, activeCategory]);
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalPrice = Object.keys(cart).reduce((sum, key) => { const parts = key.split('-'); parts.pop(); const extrasStr = parts.slice(3).join('-'); const [id, variant] = parts; const item = menu.find(m => m.id == id); if (!item) return sum; let price = variant === 'special' ? item.price_special : item.price; const extras = extrasStr ? extrasStr.split(',') : []; extras.forEach(exName => { const exOption = EXTRA_OPTIONS.find(e => e.name === exName); if (exOption) price += exOption.price; }); return sum + (price * cart[key]); }, 0);

  if (!tableId) return <div className="h-screen flex items-center justify-center text-gray-500">📷 สแกน QR Code ที่โต๊ะนะครับ</div>;
  if (sessionEnded) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white"><h1>ขอบคุณที่ใช้บริการ</h1></div>;
  if (!isAuthorized) return <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white"><h1>รอพนักงานเปิดโต๊ะ...</h1></div>;

  return (
    <div className="min-h-screen bg-gray-100 pb-32 max-w-md mx-auto relative font-sans">
      <div className="bg-white p-4 sticky top-0 z-30 shadow-sm flex justify-between items-center"><h1 className="text-xl font-black text-orange-600">🍜 ก๋วยเตี๋ยวรสเด็ด <span className="text-gray-400 text-sm font-normal">| โต๊ะ {table.table_number}</span></h1></div>
      
      <div className="bg-white px-2 py-2 sticky top-[60px] z-20 shadow-sm flex gap-1 justify-center border-b border-gray-100 mt-1">
          {categories.map(cat => ( <button key={cat} onClick={() => setActiveCategory(cat)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeCategory === cat ? 'bg-orange-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}>{categoryNames[cat]}</button> ))}
      </div>
      <div className="p-4 gap-4 flex flex-col">
        {filteredMenu.map((item) => { const sel = getSelection(item.id); const extrasKey = sel.extras.sort().join(','); const typeKey = sel.isTakeaway ? 'takeaway' : 'dinein'; const cartKeyNormal = `${item.id}-normal-${sel.noodle || 'none'}-${extrasKey}-${typeKey}`; const cartKeySpecial = `${item.id}-special-${sel.noodle || 'none'}-${extrasKey}-${typeKey}`; const qtyNormal = cart[cartKeyNormal] || 0; const qtySpecial = cart[cartKeySpecial] || 0; const hasSpecial = item.price_special > 0; const showOptions = item.category === 'Noodles' || item.category === 'GaoLao'; return (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
             <div className="flex justify-between items-start mb-2"><div><h3 className="font-black text-lg text-gray-800 leading-tight">{item.name}</h3><p className="text-xs text-gray-400 mt-1">{categoryNames[item.category]}</p></div><div className="text-right"><span className="block font-bold text-gray-800">{item.price}.-</span>{hasSpecial && <span className="block text-xs text-orange-500 font-bold">พิเศษ {item.price_special}.-</span>}</div></div>
             {item.category === 'Noodles' && ( <div className="mb-3"><select className="w-full bg-orange-50 border border-orange-200 text-gray-700 text-sm rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-orange-500" value={sel.noodle} onChange={(e) => handleNoodleChange(item.id, e.target.value)}><option value="" disabled>--- กรุณาเลือกเส้น ---</option>{NOODLE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}</select></div> )}
             {showOptions && ( <div className="mb-3 flex flex-wrap gap-2">{EXTRA_OPTIONS.map((ex) => ( <button key={ex.name} onClick={() => handleExtraToggle(item.id, ex.name)} className={`px-3 py-1 rounded-full text-xs border transition-all ${sel.extras.includes(ex.name) ? 'bg-green-100 border-green-500 text-green-700 font-bold' : 'bg-white border-gray-300 text-gray-500'}`}>{sel.extras.includes(ex.name) ? '✅' : '+'} {ex.name} {ex.price > 0 && `(+${ex.price})`}</button> ))}</div> )}
             <div className="mb-3 flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-dashed border-gray-300 cursor-pointer" onClick={() => handleTakeawayToggle(item.id)}><div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${sel.isTakeaway ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-400'}`}>{sel.isTakeaway && <span className="text-white text-xs font-bold">✓</span>}</div><span className={`text-sm font-bold ${sel.isTakeaway ? 'text-orange-600' : 'text-gray-500'}`}>ใส่ถุงกลับบ้าน 🛍️</span></div>
             <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-dashed"><div className="flex justify-between items-center pr-2 border-r border-gray-100"><span className="text-xs font-bold text-gray-600">ธรรมดา</span>{qtyNormal > 0 ? (<div className="flex items-center gap-1 bg-gray-100 rounded-full px-1"><button onClick={()=>removeFromCart(item, 'normal')} className="text-red-500 font-bold px-2">-</button><span className="font-bold text-sm">{qtyNormal}</span><button onClick={()=>addToCart(item, 'normal')} className="text-green-600 font-bold px-2">+</button></div>) : ( <button onClick={()=>addToCart(item, 'normal')} className="bg-gray-200 text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-300">เลือก</button> )}</div>{hasSpecial ? (<div className="flex justify-between items-center pl-2"><span className="text-xs font-bold text-orange-600">พิเศษ</span>{qtySpecial > 0 ? (<div className="flex items-center gap-1 bg-orange-50 rounded-full px-1 border border-orange-100"><button onClick={()=>removeFromCart(item, 'special')} className="text-red-500 font-bold px-2">-</button><span className="font-bold text-sm">{qtySpecial}</span><button onClick={()=>addToCart(item, 'special')} className="text-green-600 font-bold px-2">+</button></div>) : ( <button onClick={()=>addToCart(item, 'special')} className="bg-orange-200 text-orange-700 px-3 py-1 rounded text-xs font-bold hover:bg-orange-300">เลือก</button> )}</div>) : ( <div className="flex items-center justify-center text-xs text-gray-300">- ไม่มีพิเศษ -</div> )}</div></div>)})}
      </div>

      {totalItems > 0 && ( <div className="fixed bottom-0 left-0 w-full p-4 z-30 bg-gradient-to-t from-white via-white to-transparent pt-8"><div className="max-w-md mx-auto bg-gray-900 text-white p-4 rounded-2xl shadow-xl flex justify-between items-center"><div><p className="text-sm text-gray-400">รายการ: {totalItems}</p><p className="font-bold text-xl">รวม: {totalPrice} บาท</p></div><button onClick={preparePayment} className="bg-orange-500 px-6 py-2 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-transform flex items-center gap-2"><span>ชำระเงิน</span> 💸</button></div></div> )}

      {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in">
              <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center relative">
                  <button onClick={() => setShowPaymentModal(false)} className="absolute top-4 right-4 text-gray-400 text-xl font-bold">✕</button>
                  <h2 className="text-2xl font-black text-gray-800 mb-2">สแกนจ่าย</h2>
                  <p className="text-gray-500 mb-4">ยอดชำระ <span className="text-orange-600 font-bold text-xl">{totalPrice}</span> บาท</p>
                  <div className="bg-gray-100 p-4 rounded-xl mb-4 inline-block">{qrCodeUrl ? <img src={qrCodeUrl} className="w-48 h-48 mix-blend-multiply" /> : <div className="w-48 h-48 bg-gray-200 animate-pulse"></div>}</div>
                  <div className="text-left text-sm text-gray-600 mb-4">1. สแกน QR ด้วยแอปธนาคาร<br/>2. ยอดเงินจะขึ้นอัตโนมัติ<br/>3. แนบสลิปด้านล่าง 👇</div>

                  {/* 🔥 ปุ่มแนบสลิป (ใช้งานจริงได้แล้ว) */}
                  <label className={`block w-full border-2 border-dashed rounded-xl p-3 mb-4 text-center cursor-pointer transition-colors ${slipFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-orange-400'}`}>
                      {slipFile ? (
                          <div className="text-green-700 font-bold flex items-center justify-center gap-2">📄 แนบสลิปแล้ว ({slipFile.name.slice(0, 10)}...)</div>
                      ) : (
                          <div className="text-gray-400">📎 กดเพื่อแนบสลิป (สำคัญ)</div>
                      )}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setSlipFile(e.target.files[0])} />
                  </label>

                  <button onClick={confirmPaymentAndOrder} disabled={isUploading} className={`w-full text-white font-bold py-3 rounded-xl shadow-lg transition-transform ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 active:scale-95'}`}>
                      {isUploading ? 'กำลังอัปโหลด...' : '✅ โอนแล้ว / สั่งเลย'}
                  </button>
              </div>
          </div>
      )}
      <style jsx global>{`@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fade-in 0.2s ease-out; }`}</style>
    </div>
  );
}
export default function OrderPage() { return <Suspense fallback={<div>Loading...</div>}><OrderPageContent /></Suspense>; }