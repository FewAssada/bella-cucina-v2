"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 🔑 รหัสผ่านแอดมิน
const ADMIN_PIN = "160942"; 

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [activeTab, setActiveTab] = useState('tables');
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', category: 'Food', image_url: '' });
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());

  // Check Login Session
  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") === "true") setIsAuthenticated(true);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (pinInput === ADMIN_PIN) {
        setIsAuthenticated(true);
        sessionStorage.setItem("admin_auth", "true");
    } else {
        alert("รหัสผิดครับ!");
        setPinInput("");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("admin_auth");
  };

  // Realtime Data Fetching
  const fetchData = async () => {
    const { data: t } = await supabase.from('restaurant_tables').select('*').order('table_number');
    if (t) setTables(t);
    const { data: o } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (o) setOrders(o);
    const { data: m } = await supabase.from('restaurant_menus').select('*').order('id');
    if (m) setMenus(m);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchData();
    const channel = supabase.channel('admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, fetchData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [isAuthenticated]);

  // --- Table Actions ---
  const handleOpenTable = async (id) => {
    // ถามรหัสจากพนักงาน (หรือกด OK เพื่อสุ่ม)
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    const customKey = prompt(`กำหนดรหัสเข้าโต๊ะ (Default: ${randomPin})`, randomPin);
    
    if (customKey) {
        await supabase.from('restaurant_tables').update({ status: 'occupied', session_key: customKey }).eq('id', id);
        fetchData();
    }
  };

  const handleCloseTable = async (id) => {
      if(confirm("ต้องการปิดโต๊ะและเคลียร์ลูกค้าใช่ไหม?")) {
        await supabase.from('restaurant_tables').update({ status: 'available', session_key: null }).eq('id', id);
        fetchData();
      }
  };

  const addTable = async () => { const next = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1; await supabase.from('restaurant_tables').insert([{ table_number: next, status: 'available' }]); fetchData(); };

  // --- Order Actions ---
  const toggleSelectOrder = (id) => { const newSelected = new Set(selectedOrderIds); if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id); setSelectedOrderIds(newSelected); };
  const toggleSelectAll = () => { if (selectedOrderIds.size === orders.length) setSelectedOrderIds(new Set()); else setSelectedOrderIds(new Set(orders.map(o => o.id))); };
  const deleteSelectedOrders = async () => { const ids = Array.from(selectedOrderIds); if (ids.length === 0) return; if (!confirm(`ยืนยันลบ ${ids.length} รายการ?`)) return; await supabase.from('orders').delete().in('id', ids); setSelectedOrderIds(new Set()); fetchData(); };
  const updateOrder = async (id, status) => { await supabase.from('orders').update({ status }).eq('id', id); fetchData(); };
  const exportToTxt = () => { if (orders.length === 0) return; let content = "Order Report\n==========\n"; orders.forEach(o => { content += `Table ${o.table_number} (${o.status}): ${o.total_price}B\n`; }); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], {type:'text/plain'})); link.download = 'orders.txt'; link.click(); };

  // --- Menu Actions ---
  const handleAddMenu = async (e) => { e.preventDefault(); await supabase.from('restaurant_menus').insert([newMenu]); setNewMenu({ name: '', price: '', category: 'Food', image_url: '' }); fetchData(); };
  const deleteMenu = async (id) => { if(confirm("ลบเมนูนี้?")) await supabase.from('restaurant_menus').delete().eq('id', id); fetchData(); };

  // Login Screen
  if (!isAuthenticated) return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center border border-gray-700">
            <h1 className="text-2xl font-bold text-white mb-6">Admin Login</h1>
            <form onSubmit={handleLogin}>
                <input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-center text-xl tracking-widest mb-4 outline-none focus:border-blue-500" placeholder="PIN" autoFocus/>
                <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all">เข้าสู่ระบบ</button>
            </form>
        </div>
    </div>
  );

  // Admin Dashboard
  return (
    <div className="min-h-screen bg-[#0f172a] p-6 text-white font-sans">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">Admin Manager</h1>
        <div className="flex bg-gray-800 p-1 rounded-lg shadow-lg">
           <button onClick={() => setActiveTab('tables')} className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'tables' ? 'bg-blue-600 shadow' : 'text-gray-400 hover:text-white'}`}>โต๊ะ</button>
           <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'orders' ? 'bg-blue-600 shadow' : 'text-gray-400 hover:text-white'}`}>ออเดอร์</button>
           <button onClick={() => setActiveTab('menu')} className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'menu' ? 'bg-blue-600 shadow' : 'text-gray-400 hover:text-white'}`}>เมนู</button>
           <button onClick={handleLogout} className="px-4 py-2 rounded-md font-bold text-red-400 hover:bg-red-500/10 ml-2">ออก</button>
        </div>
      </div>

      {activeTab === 'tables' && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in">
          {tables.map((t) => (
            <div key={t.id} className={`p-6 rounded-2xl border-2 text-center transition-all ${t.status === 'available' ? 'border-green-500/30 bg-gray-800/50' : 'border-red-500/30 bg-gray-800'}`}>
              <h3 className="text-4xl font-black mb-2">{t.table_number}</h3>
              {t.status === 'occupied' && <div className="bg-yellow-400 text-black font-black text-2xl py-1 rounded mb-4 tracking-widest">{t.session_key}</div>}
              <div className="mb-4"><span className={`px-2 py-1 rounded text-xs uppercase ${t.status === 'available' ? 'text-green-400' : 'text-red-400'}`}>{t.status === 'available' ? 'ว่าง' : 'มีลูกค้า'}</span></div>
              {t.status === 'available' ? (
                  <button onClick={() => handleOpenTable(t.id)} className="w-full py-2 rounded-xl font-bold bg-green-600 hover:bg-green-500 shadow-lg text-sm">⚡ เปิดโต๊ะ</button>
              ) : (
                  <button onClick={() => handleCloseTable(t.id)} className="w-full py-2 rounded-xl font-bold bg-red-600 hover:bg-red-500 shadow-lg text-sm">เช็คบิล</button>
              )}
            </div>
          ))}
          <button onClick={addTable} className="border-2 border-dashed border-gray-600 rounded-2xl flex items-center justify-center text-gray-500 hover:text-white hover:border-white h-[200px]">+ เพิ่มโต๊ะ</button>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="animate-fade-in">
           <div className="flex justify-between items-center mb-4 bg-gray-800 p-3 rounded-xl">
              <h2 className="font-bold">รายการออเดอร์ ({orders.length})</h2>
              <div className="flex gap-2">
                <button onClick={toggleSelectAll} className="px-3 py-1 bg-gray-700 rounded text-xs">เลือกทั้งหมด</button>
                {selectedOrderIds.size > 0 && <button onClick={deleteSelectedOrders} className="px-3 py-1 bg-red-600 rounded text-xs animate-pulse">ลบ {selectedOrderIds.size} รายการ</button>}
                <button onClick={exportToTxt} className="px-3 py-1 bg-green-600 rounded text-xs">Export .TXT</button>
              </div>
           </div>
           <div className="space-y-3">
             {orders.map((o) => (
               <div key={o.id} className={`bg-gray-800 p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${selectedOrderIds.has(o.id) ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'}`}>
                 <div className="flex items-center"><input type="checkbox" checked={selectedOrderIds.has(o.id)} onChange={() => toggleSelectOrder(o.id)} className="w-5 h-5 accent-blue-500"/></div>
                 <div className="flex-1">
                     <div className="flex justify-between border-b border-gray-700 pb-2 mb-2"><span className="font-bold text-orange-400">โต๊ะ {o.table_number}</span><span className={`text-xs px-2 rounded ${o.status==='pending'?'bg-yellow-600':o.status==='completed'?'bg-green-600':'bg-blue-600'}`}>{o.status}</span></div>
                     {o.items.map((i,idx)=><div key={idx} className="flex justify-between text-sm text-gray-300"><span>{i.name} x{i.quantity}</span><span>{i.price*i.quantity}</span></div>)}
                     <div className="text-right mt-2 font-bold text-green-400">Total: {o.total_price}.-</div>
                 </div>
                 <div className="flex flex-col gap-2 justify-center">
                    {o.status==='pending' && <button onClick={()=>updateOrder(o.id,'cooking')} className="bg-yellow-600 py-1 px-3 rounded text-sm">รับออเดอร์</button>}
                    {o.status==='cooking' && <button onClick={()=>updateOrder(o.id,'served')} className="bg-blue-600 py-1 px-3 rounded text-sm">เสิร์ฟ</button>}
                    {o.status==='served' && <button onClick={()=>updateOrder(o.id,'completed')} className="bg-green-600 py-1 px-3 rounded text-sm">จบงาน</button>}
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {activeTab === 'menu' && (
        <div className="animate-fade-in max-w-4xl mx-auto">
           <form onSubmit={handleAddMenu} className="bg-gray-800 p-4 rounded-xl mb-6 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <input className="bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded" placeholder="ชื่อเมนู" value={newMenu.name} onChange={e=>setNewMenu({...newMenu, name: e.target.value})} required />
              <input type="number" className="bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded" placeholder="ราคา" value={newMenu.price} onChange={e=>setNewMenu({...newMenu, price: e.target.value})} required />
              <select className="bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded" value={newMenu.category} onChange={e=>setNewMenu({...newMenu, category: e.target.value})}>
                <option value="Food">อาหาร</option><option value="Drink">เครื่องดื่ม</option><option value="Dessert">ของหวาน</option>
              </select>
              <button type="submit" className="bg-green-600 text-white px-3 py-2 rounded font-bold">เพิ่ม</button>
           </form>
           <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
             {menus.map((m) => (
               <div key={m.id} className="flex justify-between items-center p-3 border-b border-gray-700 hover:bg-gray-700">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 bg-gray-600 rounded overflow-hidden">{m.image_url ? <img src={m.image_url} className="w-full h-full object-cover"/> : '📷'}</div><div><p>{m.name}</p><p className="text-xs text-gray-400">{m.price} บาท</p></div></div>
                  <button onClick={() => deleteMenu(m.id)} className="text-red-400 text-sm">ลบ</button>
               </div>
             ))}
           </div>
        </div>
      )}
      <style jsx global>{`@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fade-in 0.3s ease-out; }`}</style>
    </div>
  );
}