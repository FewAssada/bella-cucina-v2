"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ADMIN_PIN = "160942"; 

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [activeTab, setActiveTab] = useState('orders'); // เริ่มที่หน้าออเดอร์
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', price_special: '', category: 'Noodles', image_url: '' });
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());

  useEffect(() => {
    if (sessionStorage.getItem("admin_auth") === "true") setIsAuthenticated(true);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (pinInput === ADMIN_PIN) {
        setIsAuthenticated(true);
        sessionStorage.setItem("admin_auth", "true");
    } else {
        alert("รหัสผิด!"); setPinInput("");
    }
  };
  const handleLogout = () => { setIsAuthenticated(false); sessionStorage.removeItem("admin_auth"); };

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

  const handleOpenTable = async (id) => {
    const customKey = prompt("ตั้งรหัสเข้าโต๊ะ (กด OK เพื่อสุ่ม):", Math.floor(1000 + Math.random() * 9000));
    if (customKey) { await supabase.from('restaurant_tables').update({ status: 'occupied', session_key: customKey }).eq('id', id); fetchData(); }
  };
  const handleCloseTable = async (id) => { if(confirm("ปิดโต๊ะ?")) await supabase.from('restaurant_tables').update({ status: 'available', session_key: null }).eq('id', id); fetchData(); };
  const addTable = async () => { const next = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1; await supabase.from('restaurant_tables').insert([{ table_number: next, status: 'available' }]); fetchData(); };

  const handleAddMenu = async (e) => { 
      e.preventDefault(); 
      const payload = { ...newMenu, price_special: newMenu.price_special ? newMenu.price_special : null };
      const { error } = await supabase.from('restaurant_menus').insert([payload]); 
      if (error) alert("Error: " + error.message);
      else { setNewMenu({ name: '', price: '', price_special: '', category: 'Noodles', image_url: '' }); fetchData(); }
  };
  const deleteMenu = async (id) => { if(confirm("ลบเมนูนี้?")) await supabase.from('restaurant_menus').delete().eq('id', id); fetchData(); };

  const toggleSelectOrder = (id) => { const newSelected = new Set(selectedOrderIds); if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id); setSelectedOrderIds(newSelected); };
  const toggleSelectAll = () => { if (selectedOrderIds.size === orders.length) setSelectedOrderIds(new Set()); else setSelectedOrderIds(new Set(orders.map(o => o.id))); };
  const deleteSelectedOrders = async () => { const ids = Array.from(selectedOrderIds); if (ids.length === 0) return; if (!confirm(`ลบ ${ids.length} รายการ?`)) return; await supabase.from('orders').delete().in('id', ids); setSelectedOrderIds(new Set()); fetchData(); };
  const updateOrder = async (id, status) => { await supabase.from('orders').update({ status }).eq('id', id); fetchData(); };
  const exportToTxt = () => { if (orders.length === 0) return; let content = "Order Report\n==========\n"; orders.forEach(o => { content += `Table ${o.table_number}: ${o.total_price}B\n`; }); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], {type:'text/plain'})); link.download = 'orders.txt'; link.click(); };

  if (!isAuthenticated) return ( <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><div className="bg-gray-800 p-8 rounded-xl text-center"><h1 className="text-white text-2xl mb-4">Admin Login</h1><form onSubmit={handleLogin}><input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} className="p-2 rounded text-center text-black w-full mb-2" placeholder="PIN" autoFocus/><button className="w-full bg-blue-600 text-white p-2 rounded">เข้าสู่ระบบ</button></form></div></div> );

  return (
    <div className="min-h-screen bg-[#0f172a] p-6 text-white font-sans">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold">Admin Manager</h1>
        <div className="flex bg-gray-800 p-1 rounded-lg">
           <button onClick={() => setActiveTab('tables')} className={`px-4 py-2 rounded ${activeTab === 'tables' ? 'bg-blue-600' : ''}`}>โต๊ะ</button>
           <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded ${activeTab === 'orders' ? 'bg-blue-600' : ''}`}>ออเดอร์</button>
           <button onClick={() => setActiveTab('menu')} className={`px-4 py-2 rounded ${activeTab === 'menu' ? 'bg-blue-600' : ''}`}>เมนู</button>
           <button onClick={handleLogout} className="px-4 py-2 rounded text-red-400 ml-2">ออก</button>
        </div>
      </div>

      {activeTab === 'menu' && (
        <div className="animate-fade-in max-w-5xl mx-auto">
           <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg mb-8">
             <h3 className="text-gray-300 font-bold mb-4 flex items-center gap-2">📝 เพิ่มเมนูใหม่</h3>
             <form onSubmit={handleAddMenu} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div className="md:col-span-2"><label className="text-xs text-gray-400 mb-1 block">ชื่อเมนู</label><input className="w-full bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded focus:border-blue-500 outline-none" placeholder="เช่น เส้นเล็กน้ำตก" value={newMenu.name} onChange={e=>setNewMenu({...newMenu, name: e.target.value})} required /></div>
                <div className="md:col-span-1"><label className="text-xs text-gray-400 mb-1 block">ราคาปกติ</label><input type="number" className="w-full bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded focus:border-blue-500 outline-none" placeholder="0" value={newMenu.price} onChange={e=>setNewMenu({...newMenu, price: e.target.value})} required /></div>
                <div className="md:col-span-1"><label className="text-xs text-yellow-400 mb-1 block">ราคาพิเศษ (ถ้ามี)</label><input type="number" className="w-full bg-gray-900 border border-yellow-600/50 text-white px-3 py-2 rounded focus:border-yellow-500 outline-none" placeholder="0" value={newMenu.price_special} onChange={e=>setNewMenu({...newMenu, price_special: e.target.value})} /></div>
                <div className="md:col-span-1"><label className="text-xs text-gray-400 mb-1 block">หมวดหมู่</label><select className="w-full bg-gray-900 border border-gray-600 text-white px-3 py-2 rounded focus:border-blue-500 outline-none" value={newMenu.category} onChange={e=>setNewMenu({...newMenu, category: e.target.value})}><option value="Noodles">🍜 ก๋วยเตี๋ยว</option><option value="GaoLao">🍲 เกาเหลา</option><option value="Sides">🍚 ของทานเล่น/ข้าว</option><option value="Drinks">🥤 เครื่องดื่ม</option></select></div>
                <div className="md:col-span-1"><button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold shadow-lg transition-transform active:scale-95 h-[42px]">+ เพิ่ม</button></div>
                <div className="md:col-span-6 mt-2"><input className="w-full bg-gray-900 border border-gray-700 text-gray-400 text-sm px-3 py-2 rounded" placeholder="ลิ้งค์รูปภาพ (URL)" value={newMenu.image_url} onChange={e=>setNewMenu({...newMenu, image_url: e.target.value})} /></div>
             </form>
           </div>
           <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
             <table className="w-full text-left border-collapse">
               <thead><tr className="bg-gray-900 text-gray-400 text-xs uppercase border-b border-gray-700"><th className="px-4 py-3">รูป</th><th className="px-4 py-3">ชื่อเมนู</th><th className="px-4 py-3">หมวดหมู่</th><th className="px-4 py-3">ราคา</th><th className="px-4 py-3 text-right">จัดการ</th></tr></thead>
               <tbody>
                 {menus.map((m) => (
                   <tr key={m.id} className="hover:bg-gray-700/50 border-b border-gray-700 last:border-0 transition-colors">
                      <td className="px-4 py-3 w-16"><div className="w-10 h-10 bg-gray-700 rounded overflow-hidden flex items-center justify-center">{m.image_url ? <img src={m.image_url} className="w-full h-full object-cover"/> : "🍽️"}</div></td>
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-1 rounded bg-gray-700 border border-gray-600 text-gray-300">{m.category}</span></td>
                      <td className="px-4 py-3"><div className="flex flex-col text-sm"><span className="text-gray-300">ธรรมดา: {m.price}</span>{m.price_special && <span className="text-yellow-400 font-bold">พิเศษ: {m.price_special}</span>}</div></td>
                      <td className="px-4 py-3 text-right"><button onClick={() => deleteMenu(m.id)} className="text-red-400 border border-red-500/30 px-3 py-1 rounded text-xs">ลบ</button></td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      )}

      {activeTab === 'tables' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in">
          {tables.map((t) => (
            <div key={t.id} className={`p-6 rounded-2xl border-2 text-center ${t.status === 'available' ? 'border-green-500/30 bg-gray-800/50' : 'border-red-500/30 bg-gray-800'}`}>
              <h3 className="text-4xl font-black mb-2">{t.table_number}</h3>
              {t.status === 'occupied' && <div className="bg-yellow-400 text-black font-black text-2xl py-1 rounded mb-4 tracking-widest">{t.session_key}</div>}
              <div className="mb-4"><span className={`px-2 py-1 rounded text-xs uppercase ${t.status === 'available' ? 'text-green-400' : 'text-red-400'}`}>{t.status === 'available' ? 'ว่าง' : 'มีลูกค้า'}</span></div>
              {t.status === 'available' ? ( <button onClick={() => handleOpenTable(t.id)} className="w-full py-2 rounded-xl font-bold bg-green-600 hover:bg-green-500 shadow-lg text-sm">⚡ เปิดโต๊ะ</button> ) : ( <button onClick={() => handleCloseTable(t.id)} className="w-full py-2 rounded-xl font-bold bg-red-600 hover:bg-red-500 shadow-lg text-sm">เช็คบิล</button> )}
            </div>
          ))}
          <button onClick={addTable} className="border-2 border-dashed border-gray-600 rounded-2xl text-gray-500 hover:text-white h-[200px]">+ เพิ่มโต๊ะ</button>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="animate-fade-in">
           <div className="flex justify-between items-center mb-4 bg-gray-800 p-3 rounded-xl">
              <h2 className="font-bold">ออเดอร์ ({orders.length})</h2>
              <div className="flex gap-2"><button onClick={toggleSelectAll} className="px-3 py-1 bg-gray-700 rounded text-xs">เลือกทั้งหมด</button>{selectedOrderIds.size > 0 && <button onClick={deleteSelectedOrders} className="px-3 py-1 bg-red-600 rounded text-xs animate-pulse">ลบ {selectedOrderIds.size} รายการ</button>}<button onClick={exportToTxt} className="px-3 py-1 bg-green-600 rounded text-xs">Export</button></div>
           </div>
           <div className="space-y-3">
             {orders.map((o) => (
               <div key={o.id} className={`bg-gray-800 p-4 rounded-xl border flex flex-col md:flex-row gap-4 ${selectedOrderIds.has(o.id) ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'}`}>
                 <div className="flex items-center"><input type="checkbox" checked={selectedOrderIds.has(o.id)} onChange={() => toggleSelectOrder(o.id)} className="w-5 h-5 accent-blue-500"/></div>
                 <div className="flex-1">
                     <div className="flex justify-between border-b border-gray-700 pb-2 mb-2">
                         <div className="flex items-center gap-2">
                             <span className="font-bold text-orange-400 text-lg">โต๊ะ {o.table_number}</span>
                             {/* 🔥 โชว์ป้ายกลับบ้าน */}
                             {o.order_type === 'takeaway' && <span className="bg-red-500 text-white px-2 py-0.5 rounded text-xs font-bold border border-red-400 shadow-sm animate-pulse">🛍️ กลับบ้าน</span>}
                             {o.order_type === 'dine_in' && <span className="bg-green-600/30 text-green-400 px-2 py-0.5 rounded text-xs border border-green-600/50">🏠 ทานร้าน</span>}
                         </div>
                         <span className={`text-xs px-2 rounded ${o.status==='pending'?'bg-yellow-600':o.status==='completed'?'bg-green-600':'bg-blue-600'}`}>{o.status}</span>
                     </div>
                     {o.items.map((i,idx)=><div key={idx} className="flex justify-between text-sm text-gray-300"><span>{i.name} {i.variant && <span className="text-yellow-400">({i.variant})</span>} x{i.quantity}</span><span>{i.price*i.quantity}</span></div>)}
                     <div className="text-right mt-2 font-bold text-green-400">รวม: {o.total_price}.-</div>
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

      <style jsx global>{`@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fade-in 0.3s ease-out; }`}</style>
    </div>
  );
}