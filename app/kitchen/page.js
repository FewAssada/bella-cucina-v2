"use client";
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ADMIN_PIN = "160942"; 

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [activeTab, setActiveTab] = useState('tables'); 
  
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  
  // States สำหรับเมนู
  const initialMenuState = { name: '', price: '', price_special: '', category: 'Noodles', image_url: '', is_available: true };
  const [newMenu, setNewMenu] = useState(initialMenuState);
  const [editingId, setEditingId] = useState(null); 

  // States อื่นๆ
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  // 🔥 States สำหรับระบบเช็คบิล (POS)
  const [showBillModal, setShowBillModal] = useState(false);
  const [currentBillTable, setCurrentBillTable] = useState(null); // เก็บข้อมูลโต๊ะที่จะคิดเงิน
  const [billItems, setBillItems] = useState([]); // รายการอาหารที่จะคิดเงิน
  const [billTotal, setBillTotal] = useState(0); // ยอดรวม
  const [cashReceived, setCashReceived] = useState(''); // เงินที่รับมา

  // ตัวแปรเสียง
  const orderBuffer = useRef([]);
  const bufferTimeout = useRef(null);
  const spokenOrderIds = useRef(new Set()); 

  useEffect(() => { if (sessionStorage.getItem("admin_auth") === "true") setIsAuthenticated(true); }, []);
  const handleLogin = (e) => { e.preventDefault(); if (pinInput === ADMIN_PIN) { setIsAuthenticated(true); sessionStorage.setItem("admin_auth", "true"); } else { alert("รหัสผิด!"); setPinInput(""); } };
  const handleLogout = () => { setIsAuthenticated(false); sessionStorage.removeItem("admin_auth"); };

  // --- Voice System ---
  const stopSpeaking = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
  const speak = (text) => {
      if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'th-TH'; utterance.rate = 1.0; utterance.pitch = 1.0; 
          window.speechSynthesis.speak(utterance);
      }
  };
  const handleTestSound = () => { stopSpeaking(); speak("ระบบ POS พร้อมทำงานครับ"); };

  // --- Fetch Data ---
  const fetchData = async () => {
    const { data: t } = await supabase.from('restaurant_tables').select('*').order('table_number'); if (t) setTables(t);
    const { data: m } = await supabase.from('restaurant_menus').select('*').order('id'); if (m) setMenus(m);
    
    const { data: activeOrders } = await supabase.from('orders').select('*').in('status', ['pending', 'cooking', 'served']).order('created_at', { ascending: true });
    const startDate = `${filterDate} 00:00:00`; const endDate = `${filterDate} 23:59:59`;
    const { data: historyOrders } = await supabase.from('orders').select('*').eq('status', 'completed').gte('created_at', startDate).lte('created_at', endDate).order('created_at', { ascending: false });

    if (activeOrders || historyOrders) {
        let all = [...(activeOrders || []), ...(historyOrders || [])];
        setOrders(all);
        if (activeOrders) activeOrders.forEach(o => spokenOrderIds.current.add(o.id));
    }
  };

  useEffect(() => { 
      if (!isAuthenticated) return; 
      fetchData(); 
      const channel = supabase.channel('admin-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
            const newOrder = payload.new;
            if (spokenOrderIds.current.has(newOrder.id)) return;
            spokenOrderIds.current.add(newOrder.id); 
            orderBuffer.current.push(newOrder);
            if (bufferTimeout.current) clearTimeout(bufferTimeout.current);
            bufferTimeout.current = setTimeout(() => {
                const sortedOrders = [...orderBuffer.current].sort((a, b) => Number(a.table_number) - Number(b.table_number));
                sortedOrders.forEach(order => { speak(`ออเดอร์ใหม่... โต๊ะ ${order.table_number}`); });
                orderBuffer.current = [];
                fetchData();
            }, 1000); 
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, fetchData)
        .subscribe(); 
      return () => { supabase.removeChannel(channel); if (bufferTimeout.current) clearTimeout(bufferTimeout.current); }; 
  }, [isAuthenticated, filterDate]);

  // --- 🔥 POS Functions (ระบบเช็คบิล) ---
  
  // 1. เปิดหน้าต่างเช็คบิล
  const openCheckBill = (table) => {
      // หาออเดอร์ทั้งหมดของโต๊ะนี้ที่ยังไม่เสร็จ
      const activeForTable = orders.filter(o => o.table_number == table.table_number && o.status !== 'completed');
      
      if (activeForTable.length === 0) return alert("โต๊ะนี้ไม่มีรายการค้างครับ");

      // รวมรายการอาหารทั้งหมด
      let allItems = [];
      let total = 0;
      activeForTable.forEach(order => {
          allItems = [...allItems, ...order.items];
          total += order.total_price;
      });

      setCurrentBillTable(table);
      setBillItems(allItems);
      setBillTotal(total);
      setCashReceived(''); // รีเซ็ตช่องรับเงิน
      setShowBillModal(true);
  };

  // 2. ยืนยันการจ่ายเงิน (ปิดงาน)
  const confirmPayment = async () => {
      if (!currentBillTable) return;
      
      // อัปเดตสถานะออเดอร์เป็น 'completed'
      const activeForTable = orders.filter(o => o.table_number == currentBillTable.table_number && o.status !== 'completed');
      for (const order of activeForTable) {
          // บันทึกว่าจ่ายแล้ว
          await supabase.from('orders').update({ status: 'completed', payment_status: 'paid_cash' }).eq('id', order.id);
      }

      // อัปเดตโต๊ะเป็น 'ว่าง'
      await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', currentBillTable.id);

      setShowBillModal(false);
      setCashReceived('');
      fetchData();
      speak(`โต๊ะ ${currentBillTable.table_number} เช็คบิลเรียบร้อย`);
  };

  // --- Other Functions ---
  const addTable = async () => { const next = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1; await supabase.from('restaurant_tables').insert([{ table_number: next, status: 'available' }]); fetchData(); };
  const toggleSelectOrder = (id) => { const newSelected = new Set(selectedOrderIds); if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id); setSelectedOrderIds(newSelected); };
  const toggleSelectAll = () => { if (selectedOrderIds.size === orders.length) setSelectedOrderIds(new Set()); else setSelectedOrderIds(new Set(orders.map(o => o.id))); };
  const deleteSelectedOrders = async () => { const ids = Array.from(selectedOrderIds); if (ids.length === 0) return; if (!confirm(`ลบ ${ids.length} รายการ?`)) return; await supabase.from('orders').delete().in('id', ids); setSelectedOrderIds(new Set()); fetchData(); };
  const updateOrder = async (id, status) => { await supabase.from('orders').update({ status }).eq('id', id); fetchData(); };
  const exportToTxt = () => { if (orders.length === 0) return; let content = `Order Report (${filterDate})\n==========\n`; orders.forEach(o => { content += `Table ${o.table_number}: ${o.total_price}B\n`; }); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], {type:'text/plain'})); link.download = `orders_${filterDate}.txt`; link.click(); };
  const handleSaveMenu = async (e) => { e.preventDefault(); const payload = { ...newMenu, price_special: newMenu.price_special ? newMenu.price_special : null }; if (editingId) { await supabase.from('restaurant_menus').update(payload).eq('id', editingId); } else { await supabase.from('restaurant_menus').insert([payload]); } setNewMenu(initialMenuState); setEditingId(null); fetchData(); };
  const startEditMenu = (menuItem) => { setNewMenu(menuItem); setEditingId(menuItem.id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const cancelEdit = () => { setNewMenu(initialMenuState); setEditingId(null); };
  const toggleMenuAvailability = async (id, currentStatus) => { await supabase.from('restaurant_menus').update({ is_available: !currentStatus }).eq('id', id); fetchData(); };
  const deleteMenu = async (id) => { if(confirm("ลบเมนูนี้ถาวร?")) await supabase.from('restaurant_menus').delete().eq('id', id); fetchData(); };

  // คำนวณเงินทอน
  const changeAmount = cashReceived ? parseFloat(cashReceived) - billTotal : 0;

  if (!isAuthenticated) return ( <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><div className="bg-gray-800 p-8 rounded-xl text-center"><h1 className="text-white text-2xl mb-4">Admin Login</h1><form onSubmit={handleLogin}><input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} className="p-2 rounded text-center text-black w-full mb-2" placeholder="PIN" autoFocus/><button className="w-full bg-blue-600 text-white p-2 rounded">เข้าสู่ระบบ</button></form></div></div> );

  return (
    <div className="min-h-screen bg-[#0f172a] p-4 md:p-6 text-white font-sans">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 sticky top-0 z-50 bg-[#0f172a]/95 py-2 backdrop-blur">
        <h1 className="text-2xl font-bold">POS Manager</h1>
        <div className="flex bg-gray-800 p-1 rounded-lg shadow-lg border border-gray-700 items-center">
           <button onClick={() => setActiveTab('tables')} className={`px-4 py-2 rounded-md transition-all font-bold ${activeTab === 'tables' ? 'bg-blue-600 shadow-md' : 'hover:bg-gray-700 text-gray-400'}`}>โต๊ะ & ครัว</button>
           <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded-md transition-all font-bold ${activeTab === 'orders' ? 'bg-blue-600 shadow-md' : 'hover:bg-gray-700 text-gray-400'}`}>ประวัติ</button>
           <button onClick={() => setActiveTab('menu')} className={`px-4 py-2 rounded-md transition-all font-bold ${activeTab === 'menu' ? 'bg-blue-600 shadow-md' : 'hover:bg-gray-700 text-gray-400'}`}>เมนู</button>
           <div className="flex ml-2 gap-1">
               <button onClick={handleTestSound} className="px-3 py-2 rounded-l-full bg-gray-700 hover:bg-green-600 text-white text-xs transition-colors" title="ทดสอบเสียง">🔊</button>
               <button onClick={stopSpeaking} className="px-3 py-2 rounded-r-full bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white text-xs transition-colors border-l border-gray-600" title="หยุดเสียง">🔇</button>
           </div>
           <button onClick={handleLogout} className="px-4 py-2 rounded text-red-400 ml-2 hover:bg-red-900/30">ออก</button>
        </div>
      </div>

      {activeTab === 'menu' && (
        <div className="animate-fade-in max-w-5xl mx-auto">
           {/* ฟอร์มเมนู */}
           <div className={`p-6 rounded-2xl border shadow-lg mb-8 transition-colors ${editingId ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-800 border-gray-700'}`}>
             <h3 className={`font-bold mb-4 flex items-center gap-2 ${editingId ? 'text-blue-300' : 'text-gray-300'}`}>{editingId ? '✏️ แก้ไขเมนู' : '📝 เพิ่มเมนูใหม่'}</h3>
             <form onSubmit={handleSaveMenu} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div className="md:col-span-2"><label className="text-xs text-gray-400 mb-1 block">ชื่อเมนู</label><input className="w-full bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded focus:border-blue-500 outline-none" placeholder="เช่น เส้นเล็กน้ำตก" value={newMenu.name} onChange={e=>setNewMenu({...newMenu, name: e.target.value})} required /></div>
                <div className="md:col-span-1"><label className="text-xs text-gray-400 mb-1 block">ราคาปกติ</label><input type="number" className="w-full bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded focus:border-blue-500 outline-none" placeholder="0" value={newMenu.price} onChange={e=>setNewMenu({...newMenu, price: e.target.value})} required /></div>
                <div className="md:col-span-1"><label className="text-xs text-yellow-400 mb-1 block">ราคาพิเศษ</label><input type="number" className="w-full bg-gray-900 border border-yellow-600/50 text-white px-3 py-2 rounded focus:border-yellow-500 outline-none" placeholder="0" value={newMenu.price_special || ''} onChange={e=>setNewMenu({...newMenu, price_special: e.target.value})} /></div>
                <div className="md:col-span-1"><label className="text-xs text-gray-400 mb-1 block">หมวดหมู่</label><select className="w-full bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded focus:border-blue-500 outline-none" value={newMenu.category} onChange={e=>setNewMenu({...newMenu, category: e.target.value})}><option value="Noodles">🍜 ก๋วยเตี๋ยว</option><option value="GaoLao">🍲 เกาเหลา</option><option value="Sides">🍚 ของทานเล่น/ข้าว</option><option value="Drinks">🥤 เครื่องดื่ม</option></select></div>
                <div className="md:col-span-1 flex gap-2"><button type="submit" className={`flex-1 py-2 rounded-lg font-bold shadow-lg transition-transform active:scale-95 h-[42px] ${editingId ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}>{editingId ? 'บันทึก' : '+ เพิ่ม'}</button>{editingId && <button type="button" onClick={cancelEdit} className="px-3 bg-gray-600 rounded-lg text-white hover:bg-gray-500">ยกเลิก</button>}</div>
                <div className="md:col-span-6 mt-2"><input className="w-full bg-gray-900 border border-gray-700 text-gray-400 text-sm px-3 py-2 rounded" placeholder="ลิ้งค์รูปภาพ (URL)" value={newMenu.image_url || ''} onChange={e=>setNewMenu({...newMenu, image_url: e.target.value})} /></div>
             </form>
           </div>
           {/* ตารางเมนู */}
           <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
             <table className="w-full text-left border-collapse">
               <thead><tr className="bg-gray-900 text-gray-400 text-xs uppercase border-b border-gray-700"><th className="px-4 py-3">รูป</th><th className="px-4 py-3">ชื่อเมนู</th><th className="px-4 py-3">หมวดหมู่</th><th className="px-4 py-3">ราคา</th><th className="px-4 py-3 text-center">สถานะ</th><th className="px-4 py-3 text-right">จัดการ</th></tr></thead>
               <tbody>
                 {menus.map((m) => (
                   <tr key={m.id} className={`border-b border-gray-700 last:border-0 transition-colors ${m.is_available ? 'hover:bg-gray-700/50' : 'bg-red-900/10 opacity-60'}`}>
                      <td className="px-4 py-3 w-16"><div className="w-10 h-10 bg-gray-700 rounded overflow-hidden flex items-center justify-center">{m.image_url ? <img src={m.image_url} className="w-full h-full object-cover"/> : "🍽️"}</div></td>
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-300">{m.category}</span></td>
                      <td className="px-4 py-3"><div className="flex flex-col text-sm"><span className="text-gray-300">ธ: {m.price}</span>{m.price_special && <span className="text-yellow-400 font-bold">พ: {m.price_special}</span>}</div></td>
                      <td className="px-4 py-3 text-center"><button onClick={() => toggleMenuAvailability(m.id, m.is_available)} className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${m.is_available ? 'bg-green-900/30 text-green-400 border-green-700 hover:bg-green-900/50' : 'bg-red-900/30 text-red-400 border-red-700 hover:bg-red-900/50'}`}>{m.is_available ? 'ขายอยู่ ✅' : 'หมด ❌'}</button></td>
                      <td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><button onClick={() => startEditMenu(m)} className="text-blue-400 border border-blue-500/30 px-3 py-1 rounded text-xs hover:bg-blue-900/30">แก้ไข</button><button onClick={() => deleteMenu(m.id)} className="text-red-400 border border-red-500/30 px-3 py-1 rounded text-xs hover:bg-red-900/30">ลบ</button></div></td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      )}

      {activeTab === 'tables' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
          {tables.map((t) => {
            const tableActiveOrders = orders.filter(o => o.table_number == t.table_number && o.status !== 'completed');
            const tableTotal = tableActiveOrders.reduce((sum, o) => sum + o.total_price, 0);
            const lastTime = tableActiveOrders.length > 0 ? new Date(tableActiveOrders[tableActiveOrders.length - 1].created_at).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'}) : null;

            return (
              <div key={t.id} className={`p-4 rounded-2xl border-2 flex flex-col h-full min-h-[250px] relative transition-colors ${tableActiveOrders.length > 0 ? 'border-orange-500/50 bg-gray-800 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'border-green-500/20 bg-gray-900/50'}`}>
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-4xl font-black">{t.table_number}</h3>
                    <div className="text-right">
                        <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${tableActiveOrders.length > 0 ? 'bg-orange-900 text-orange-400 border border-orange-700' : 'bg-green-900/30 text-green-400 border border-green-700/50'}`}>
                            {tableActiveOrders.length > 0 ? 'กำลังทาน 🍜' : 'ว่าง'}
                        </span>
                        {lastTime && <div className="text-xs text-gray-400 mt-1">สั่ง: {lastTime} น.</div>}
                    </div>
                </div>

                <div className="flex-1 bg-gray-900/50 rounded-lg p-2 mb-2 overflow-y-auto max-h-[200px] border border-gray-700/50 custom-scrollbar">
                    {tableActiveOrders.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-600 text-sm italic">ยังไม่มีรายการ</div>
                    ) : (
                        <div className="space-y-3">
                            {tableActiveOrders.map((order, oIdx) => (
                                <div key={order.id} className="border-b border-gray-700 pb-2 last:border-0 last:pb-0">
                                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                        <span>#{order.id.toString().slice(-4)}</span>
                                        <span className={`uppercase font-bold ${order.status==='pending'?'text-yellow-500':order.status==='cooking'?'text-blue-400':'text-green-500'}`}>{order.status}</span>
                                    </div>
                                    {order.items.map((item, iIdx) => (
                                        <div key={iIdx} className="flex justify-between text-sm mb-1">
                                            <div className="flex-1 pr-2"><span className="text-gray-200">{item.name}</span></div>
                                            <div className="font-bold text-yellow-400 whitespace-nowrap">x {item.quantity}</div>
                                        </div>
                                    ))}
                                    {order.status === 'pending' && (
                                        <button onClick={()=>updateOrder(order.id, 'served')} className="w-full mt-1 bg-blue-600/30 hover:bg-blue-600 text-blue-200 text-xs py-1 rounded border border-blue-500/50 transition-colors">👉 รับทราบ / ทำอาหาร</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="mt-auto pt-2 border-t border-gray-700">
                    {tableActiveOrders.length > 0 && (
                        <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-sm text-gray-400">ยอดรวม</span>
                            <span className="text-xl font-bold text-green-400">{tableTotal}.-</span>
                        </div>
                    )}
                    {tableActiveOrders.length > 0 ? (
                        // 🔥 ปุ่มเช็คบิล (POS)
                        <button onClick={() => openCheckBill(t)} className="w-full py-2 rounded-xl font-bold bg-green-600 hover:bg-green-500 text-white text-sm border border-green-500 transition-colors shadow-lg active:scale-95">
                            💰 เช็คบิล / รับเงิน
                        </button>
                    ) : ( <div className="h-8"></div> )}
                </div>
              </div>
            );
          })}
          <button onClick={addTable} className="border-2 border-dashed border-gray-600 rounded-2xl text-gray-500 hover:text-white h-[250px] flex flex-col items-center justify-center gap-2 hover:bg-gray-800 transition-colors">
              <span className="text-3xl">+</span><span>เพิ่มโต๊ะ</span>
          </button>
        </div>
      )}

      {/* Orders History Tab */}
      {activeTab === 'orders' && (
        <div className="animate-fade-in">
           <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-gray-800 p-4 rounded-xl gap-4">
              <div className="flex items-center gap-4"><h2 className="font-bold text-lg">ประวัติออเดอร์ ({orders.length})</h2><input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="bg-gray-900 border border-gray-600 text-white px-3 py-1 rounded font-bold outline-none focus:border-blue-500" /></div>
              <div className="flex gap-2"><button onClick={toggleSelectAll} className="px-3 py-1 bg-gray-700 rounded text-xs hover:bg-gray-600">เลือกทั้งหมด</button>{selectedOrderIds.size > 0 && <button onClick={deleteSelectedOrders} className="px-3 py-1 bg-red-600 rounded text-xs animate-pulse hover:bg-red-500">ลบ {selectedOrderIds.size} รายการ</button>}<button onClick={exportToTxt} className="px-3 py-1 bg-green-600 rounded text-xs hover:bg-green-500">Export</button></div>
           </div>
           <div className="space-y-3">
             {orders.length === 0 && <div className="text-center py-10 text-gray-500">ไม่มีออเดอร์ในวันที่เลือก (หรือกำลังทำอยู่)</div>}
             {orders.map((o) => (
               <div key={o.id} className={`bg-gray-800 p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${selectedOrderIds.has(o.id) ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'}`}>
                 <div className="flex items-center"><input type="checkbox" checked={selectedOrderIds.has(o.id)} onChange={() => toggleSelectOrder(o.id)} className="w-5 h-5 accent-blue-500"/></div>
                 <div className="flex-1">
                     <div className="flex justify-between border-b border-gray-700 pb-2 mb-2">
                         <div className="flex items-center gap-3"><span className="font-bold text-orange-400 text-2xl">โต๊ะ {o.table_number}</span>{o.order_type === 'takeaway' && <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold border border-red-400">🛍️ กลับบ้าน</span>}<span className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wide ${o.payment_status === 'paid_slip_attached' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500'}`}>{o.payment_status === 'paid_slip_attached' ? '💸 จ่ายแล้ว' : 'รอจ่าย'}</span></div>
                         <div className="flex items-center gap-3"><div className="text-xl font-mono font-bold text-yellow-400 bg-gray-900 px-3 py-1 rounded border border-gray-600 shadow-inner flex items-center gap-2"><span>🕒</span>{new Date(o.created_at).toLocaleTimeString('th-TH')}</div><span className={`text-sm px-3 py-1 rounded font-bold uppercase ${o.status==='pending'?'bg-yellow-600':o.status==='completed'?'bg-green-600':'bg-blue-600'}`}>{o.status}</span></div>
                     </div>
                     {o.items.map((i,idx)=>( <div key={idx} className="flex justify-between text-base text-gray-300 py-1"><span>{i.name} {i.variant && <span className="text-yellow-400">({i.variant})</span>} {i.is_takeaway && <span className="ml-2 text-red-400 font-bold px-1 rounded text-xs">🛍️</span>}<span className="text-gray-500 ml-1">x{i.quantity}</span></span><span>{i.price*i.quantity}</span></div> ))}
                     <div className="text-right mt-2 font-bold text-green-400 text-lg">รวม: {o.total_price}.-</div>
                 </div>
                 <div className="flex flex-col gap-2 justify-center">{o.status==='pending' && <button onClick={()=>updateOrder(o.id,'cooking')} className="bg-yellow-600 py-1 px-3 rounded text-sm font-bold h-full">รับออเดอร์</button>}{o.status==='cooking' && <button onClick={()=>updateOrder(o.id,'served')} className="bg-blue-600 py-1 px-3 rounded text-sm font-bold h-full">เสิร์ฟ</button>}{o.status==='served' && <button onClick={()=>updateOrder(o.id,'completed')} className="bg-green-600 py-1 px-3 rounded text-sm font-bold h-full">จบงาน</button>}</div>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* 🔥 Check Bill Modal */}
      {showBillModal && currentBillTable && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
              <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                  {/* Header */}
                  <div className="bg-green-600 p-4 text-white flex justify-between items-center">
                      <h2 className="text-xl font-bold">💰 เช็คบิล: โต๊ะ {currentBillTable.table_number}</h2>
                      <button onClick={() => setShowBillModal(false)} className="text-white/80 hover:text-white font-bold text-2xl">×</button>
                  </div>
                  
                  {/* Body: รายการอาหาร */}
                  <div className="p-4 overflow-y-auto flex-1 bg-gray-50">
                      <table className="w-full text-sm">
                          <thead>
                              <tr className="text-gray-500 border-b border-gray-200"><th className="text-left py-2">รายการ</th><th className="text-right py-2">ราคา</th></tr>
                          </thead>
                          <tbody>
                              {billItems.map((item, index) => (
                                  <tr key={index} className="border-b border-gray-100 last:border-0">
                                      <td className="py-2 text-gray-800">{item.name} <span className="text-gray-400">x{item.quantity}</span></td>
                                      <td className="py-2 text-right font-bold text-gray-800">{item.price}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  {/* Footer: คำนวณเงิน */}
                  <div className="bg-white p-4 border-t border-gray-200 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                      <div className="flex justify-between items-center mb-4">
                          <span className="text-gray-500 font-bold">ยอดรวมสุทธิ</span>
                          <span className="text-3xl font-black text-green-600">{billTotal}.-</span>
                      </div>
                      
                      <div className="mb-4">
                          <label className="text-xs text-gray-400 font-bold block mb-1">รับเงินมา (Cash Received)</label>
                          <input 
                              type="number" 
                              value={cashReceived} 
                              onChange={(e) => setCashReceived(e.target.value)}
                              className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-2xl font-bold p-3 rounded-xl focus:border-green-500 outline-none text-right"
                              placeholder="0"
                              autoFocus
                          />
                      </div>

                      <div className="flex justify-between items-center mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="text-gray-500 font-bold">เงินทอน</span>
                          <span className={`text-2xl font-black ${changeAmount < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                              {cashReceived ? changeAmount : 0}.-
                          </span>
                      </div>

                      <button 
                          onClick={confirmPayment}
                          disabled={changeAmount < 0}
                          className={`w-full py-4 rounded-xl font-bold text-white text-lg shadow-lg transition-transform active:scale-95 ${changeAmount < 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500'}`}
                      >
                          {changeAmount < 0 ? 'รับเงินยังไม่ครบ' : '✅ ยืนยันการจ่าย / ปิดโต๊ะ'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <style jsx global>{` @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fade-in 0.3s ease-out; } .custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); } `}</style>
    </div>
  );
}