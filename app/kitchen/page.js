"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// 🔑 รหัสผ่านแอดมิน (แก้ไขตรงนี้ได้เลย)
const ADMIN_PIN = "160942"; 

export default function AdminPage() {
  // State สำหรับ Login
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [loginError, setLoginError] = useState(false);

  // State ข้อมูลร้าน
  const [activeTab, setActiveTab] = useState('tables'); // tables, orders, menu
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', category: 'Food', image_url: '' });
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());

  // --- 1. ตรวจสอบสิทธิ์ (Login Check) ---
  useEffect(() => {
    // เช็คว่าเคยล็อกอินทิ้งไว้ใน Session นี้ไหม
    const isAuth = sessionStorage.getItem("admin_auth");
    if (isAuth === "true") setIsAuthenticated(true);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (pinInput === ADMIN_PIN) {
        setIsAuthenticated(true);
        sessionStorage.setItem("admin_auth", "true");
        setLoginError(false);
    } else {
        setLoginError(true);
        setPinInput("");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("admin_auth");
  };

  // --- 2. โหลดข้อมูล Realtime ---
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

  // --- 3. ฟังก์ชันจัดการระบบ (Actions) ---
  
  // จัดการออเดอร์
  const toggleSelectOrder = (id) => { const newSelected = new Set(selectedOrderIds); if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id); setSelectedOrderIds(newSelected); };
  const toggleSelectAll = () => { if (selectedOrderIds.size === orders.length) setSelectedOrderIds(new Set()); else setSelectedOrderIds(new Set(orders.map(o => o.id))); };
  const deleteSelectedOrders = async () => { 
    const ids = Array.from(selectedOrderIds); 
    if (ids.length === 0) return; 
    if (!confirm(`⚠️ ยืนยันลบประวัติออเดอร์ ${ids.length} รายการ?\n(ข้อมูลจะหายไปถาวร)`)) return; 
    const { error } = await supabase.from('orders').delete().in('id', ids); 
    if (!error) { setSelectedOrderIds(new Set()); fetchData(); } 
  };
  const exportToTxt = () => { 
    if (orders.length === 0) return; 
    let content = "สรุปรายการออเดอร์ (Admin Report)\n==============================\n\n"; 
    orders.forEach(o => { 
        content += `[${new Date(o.created_at).toLocaleString('th-TH')}] โต๊ะ ${o.table_number} (${o.status})\n`;
        o.items.forEach(i => content += `  - ${i.name} x${i.quantity} (${i.price * i.quantity} บ.)\n`);
        content += `>> ยอดรวม: ${o.total_price} บาท\n------------------------------\n`; 
    }); 
    const blob = new Blob([content], { type: 'text/plain' }); 
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `sales_report_${new Date().toISOString().slice(0,10)}.txt`; link.click(); 
  };
  const updateOrder = async (id, status) => { await supabase.from('orders').update({ status }).eq('id', id); fetchData(); };

  // จัดการโต๊ะ
  const addTable = async () => { const next = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1; await supabase.from('restaurant_tables').insert([{ table_number: next, status: 'available' }]); fetchData(); };
  const toggleTable = async (id, status) => { const newStatus = status === 'available' ? 'occupied' : 'available'; const key = newStatus === 'occupied' ? Math.random().toString(36).substring(2, 10) : null; await supabase.from('restaurant_tables').update({ status: newStatus, session_key: key }).eq('id', id); fetchData(); };

  // จัดการเมนู
  const handleAddMenu = async (e) => { e.preventDefault(); await supabase.from('restaurant_menus').insert([newMenu]); setNewMenu({ name: '', price: '', category: 'Food', image_url: '' }); fetchData(); };
  const deleteMenu = async (id) => { if(confirm("ยืนยันลบเมนูนี้?")) { await supabase.from('restaurant_menus').delete().eq('id', id); fetchData(); } };


  // 🔒 หน้า Login (ถ้ายังไม่ใส่รหัส)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-sans">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 text-center">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30">
                <span className="text-4xl">🛡️</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Admin Access</h1>
            <p className="text-gray-400 text-sm mb-6">กรุณาใส่รหัสผ่านเพื่อจัดการร้าน</p>
            
            <form onSubmit={handleLogin}>
                <input 
                    type="password" 
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="PIN Code"
                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.5em] mb-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:tracking-normal placeholder:text-base"
                    autoFocus
                />
                {loginError && <div className="bg-red-500/20 text-red-300 px-3 py-2 rounded-lg text-sm mb-4 border border-red-500/50">❌ รหัสผ่านไม่ถูกต้อง</div>}
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg">
                    เข้าสู่ระบบ
                </button>
            </form>
        </div>
      </div>
    );
  }

  // 🟢 หน้า Admin Panel (เข้าได้แล้ว)
  return (
    <div className="min-h-screen bg-[#0f172a] p-6 text-white font-sans">
      
      {/* Navbar */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 sticky top-0 bg-[#0f172a]/95 backdrop-blur z-50 py-3 border-b border-gray-800 gap-4">
        <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
             <span className="text-xl">⚙️</span>
           </div>
           <div>
             <h1 className="text-xl font-bold leading-tight">Admin Manager</h1>
             <p className="text-xs text-gray-400">ระบบจัดการร้านอาหาร</p>
           </div>
        </div>

        <div className="flex bg-gray-800 p-1 rounded-xl shadow-lg border border-gray-700/50">
           <button onClick={() => setActiveTab('orders')} className={`px-5 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'orders' ? 'bg-gray-700 text-white shadow ring-1 ring-gray-600' : 'text-gray-400 hover:text-gray-200'}`}>
             📝 ออเดอร์ {orders.filter(o => o.status !== 'completed').length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{orders.filter(o => o.status !== 'completed').length}</span>}
           </button>
           <button onClick={() => setActiveTab('menu')} className={`px-5 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'menu' ? 'bg-gray-700 text-white shadow ring-1 ring-gray-600' : 'text-gray-400 hover:text-gray-200'}`}>
             🍔 เมนู
           </button>
           <button onClick={() => setActiveTab('tables')} className={`px-5 py-2 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'tables' ? 'bg-blue-600 text-white shadow ring-1 ring-blue-400' : 'text-gray-400 hover:text-gray-200'}`}>
             🪑 โต๊ะ
           </button>
           <button onClick={handleLogout} className="px-4 py-2 rounded-lg font-bold text-red-400 hover:bg-red-500/10 ml-1 transition-all">
             🚪
           </button>
        </div>
      </div>

      {/* --- Tab 1: จัดการโต๊ะ --- */}
      {activeTab === 'tables' && (
        <div className="animate-fade-in">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-300 border-l-4 border-blue-500 pl-3">สถานะโต๊ะทั้งหมด</h2>
            <button onClick={addTable} className="bg-teal-600 hover:bg-teal-500 px-4 py-2 rounded-lg font-bold shadow-lg transition-transform active:scale-95 flex items-center gap-2">
              <span>+</span> เพิ่มโต๊ะใหม่
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables.map((t) => (
              <div key={t.id} className={`p-6 rounded-2xl border-2 transition-all relative group ${t.status === 'available' ? 'bg-gray-800/50 border-green-500/30 hover:border-green-500' : 'bg-gray-800/50 border-red-500/30 hover:border-red-500'}`}>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                   <span className="text-xs text-gray-500">ID: {t.id}</span>
                </div>
                <h3 className="text-4xl font-black text-center mb-2 text-gray-200">{t.table_number}</h3>
                <div className="text-center mb-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${t.status === 'available' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {t.status === 'available' ? 'Available' : 'Occupied'}
                  </span>
                </div>
                <button onClick={() => toggleTable(t.id, t.status)} className={`w-full py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 ${t.status === 'available' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}>
                  {t.status === 'available' ? 'เปิดโต๊ะ ✅' : 'เคลียร์โต๊ะ 🧹'}
                </button>
                {t.session_key && <div className="mt-3 text-center"><span className="text-[10px] bg-gray-700 px-2 py-1 rounded text-gray-400 font-mono">Key: {t.session_key}</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Tab 2: ออเดอร์ --- */}
      {activeTab === 'orders' && (
        <div className="animate-fade-in">
           <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-gray-800/50 p-4 rounded-2xl border border-gray-700">
              <div className="flex items-center gap-3">
                 <h2 className="text-xl font-bold text-gray-300">รายการออเดอร์</h2>
                 <span className="bg-gray-700 text-gray-400 px-2 py-0.5 rounded text-sm">ทั้งหมด {orders.length}</span>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <button onClick={toggleSelectAll} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold border border-gray-600 transition-colors">
                    {selectedOrderIds.size === orders.length && orders.length > 0 ? '❌ ไม่เลือก' : '✅ เลือกทั้งหมด'}
                </button>
                {selectedOrderIds.size > 0 && (
                    <button onClick={deleteSelectedOrders} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold shadow-lg animate-pulse flex items-center gap-2">
                        🗑️ ลบ {selectedOrderIds.size} รายการ
                    </button>
                )}
                <button onClick={exportToTxt} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold shadow-lg flex items-center gap-2 transition-transform active:scale-95">
                    📄 Export Report
                </button>
              </div>
           </div>

           <div className="space-y-3">
             {orders.length === 0 && (
                <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-2xl">
                    <p className="text-gray-500 text-lg">📭 ยังไม่มีออเดอร์เข้ามา</p>
                </div>
             )}
             
             {orders.map((o) => (
               <div key={o.id} className={`bg-gray-800 p-4 rounded-xl border transition-all flex flex-col md:flex-row gap-4 hover:border-gray-600 ${selectedOrderIds.has(o.id) ? 'border-blue-500 bg-blue-900/10' : 'border-gray-700'}`}>
                 <div className="flex items-center justify-center md:justify-start px-2">
                    <input type="checkbox" checked={selectedOrderIds.has(o.id)} onChange={() => toggleSelectOrder(o.id)} className="w-5 h-5 rounded cursor-pointer accent-blue-500"/>
                 </div>
                 <div className="flex-1">
                     <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-3">
                        <div className="flex items-center gap-3">
                            <span className="text-lg font-black text-orange-400">โต๊ะ {o.table_number}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide ${o.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' : o.status === 'completed' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                {o.status}
                            </span>
                        </div>
                        <span className="text-xs text-gray-500 font-mono">{new Date(o.created_at).toLocaleString('th-TH')}</span>
                     </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                        {o.items.map((item, i) => (
                          <div key={i} className="flex justify-between bg-gray-900/50 p-2 rounded text-sm text-gray-300">
                            <span>{item.name} <span className="text-gray-500 text-xs">x{item.quantity}</span></span>
                            <span className="text-gray-400">{item.price * item.quantity}</span>
                          </div>
                        ))}
                     </div>
                     <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                        <span className="text-xs text-gray-500">Order ID: {o.id}</span>
                        <span className="text-lg font-bold text-green-400">Total: {o.total_price} ฿</span>
                     </div>
                 </div>
                 <div className="flex flex-col gap-2 justify-center min-w-[120px]">
                    {o.status === 'pending' && <button onClick={() => updateOrder(o.id, 'cooking')} className="bg-yellow-600 py-2 rounded-lg text-sm font-bold hover:bg-yellow-500 transition-colors">🍳 รับออเดอร์</button>}
                    {o.status === 'cooking' && <button onClick={() => updateOrder(o.id, 'served')} className="bg-blue-600 py-2 rounded-lg text-sm font-bold hover:bg-blue-500 transition-colors">🍽️ เสิร์ฟแล้ว</button>}
                    {o.status === 'served' && <button onClick={() => updateOrder(o.id, 'completed')} className="bg-green-600 py-2 rounded-lg text-sm font-bold hover:bg-green-500 transition-colors">💰 รับเงิน/จบ</button>}
                    {o.status === 'completed' && <div className="text-center p-2 bg-gray-900/50 rounded-lg border border-gray-700"><span className="text-green-500 text-sm font-bold">✅ เสร็จสิ้น</span></div>}
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* --- Tab 3: จัดการเมนู --- */}
      {activeTab === 'menu' && (
        <div className="animate-fade-in max-w-5xl mx-auto">
           <h2 className="text-xl font-bold text-gray-300 border-l-4 border-blue-500 pl-3 mb-6">จัดการเมนูอาหาร</h2>
           
           <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-lg mb-8">
             <h3 className="text-gray-400 text-sm font-bold mb-4 uppercase tracking-wider">เพิ่มเมนูใหม่</h3>
             <form onSubmit={handleAddMenu} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-4">
                    <label className="text-xs text-gray-500 mb-1 block">ชื่อเมนู</label>
                    <input className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none" placeholder="เช่น ข้าวกะเพรา" value={newMenu.name} onChange={e=>setNewMenu({...newMenu, name: e.target.value})} required />
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">ราคา</label>
                    <input type="number" className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none" placeholder="0" value={newMenu.price} onChange={e=>setNewMenu({...newMenu, price: e.target.value})} required />
                </div>
                <div className="md:col-span-3">
                    <label className="text-xs text-gray-500 mb-1 block">หมวดหมู่</label>
                    <select className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-blue-500 outline-none" value={newMenu.category} onChange={e=>setNewMenu({...newMenu, category: e.target.value})}>
                      <option value="Food">อาหาร</option><option value="Drink">เครื่องดื่ม</option><option value="Dessert">ของหวาน</option>
                    </select>
                </div>
                <div className="md:col-span-3">
                    <button type="submit" className="w-full bg-green-600 hover:bg-green-500 text-white h-[42px] rounded-lg font-bold shadow-lg transition-transform active:scale-95">
                        + เพิ่มเมนู
                    </button>
                </div>
             </form>
           </div>

           <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden shadow-lg">
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
                   <tr>
                     <th className="px-6 py-4">รูปภาพ</th>
                     <th className="px-6 py-4">ชื่อเมนู</th>
                     <th className="px-6 py-4">หมวดหมู่</th>
                     <th className="px-6 py-4">ราคา</th>
                     <th className="px-6 py-4 text-right">Action</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-700">
                   {menus.map((m) => (
                     <tr key={m.id} className="hover:bg-gray-700/50 transition-colors group">
                        <td className="px-6 py-3">
                          <div className="w-12 h-12 bg-gray-700 rounded-lg overflow-hidden border border-gray-600">
                            {m.image_url ? <img src={m.image_url} className="w-full h-full object-cover"/> : <div className="flex items-center justify-center h-full text-gray-500">📷</div>}
                          </div>
                        </td>
                        <td className="px-6 py-3 font-medium text-white">{m.name}</td>
                        <td className="px-6 py-3"><span className="bg-gray-900 text-gray-400 px-2 py-1 rounded text-xs border border-gray-700">{m.category}</span></td>
                        <td className="px-6 py-3 font-bold text-orange-400">{m.price}</td>
                        <td className="px-6 py-3 text-right">
                          <button onClick={() => deleteMenu(m.id)} className="text-red-400 hover:text-red-300 text-sm hover:underline opacity-60 group-hover:opacity-100 transition-opacity">ลบ</button>
                        </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </div>
        </div>
      )}

      <style jsx global>{`@keyframes fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fade-in 0.25s ease-out forwards; }`}</style>
    </div>
  );
}