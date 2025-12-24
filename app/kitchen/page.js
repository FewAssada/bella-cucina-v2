"use client";
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function KitchenPage() {
  const [activeTab, setActiveTab] = useState('tables'); // tables, orders, menu
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  
  // Form สำหรับเพิ่มเมนู
  const [newMenu, setNewMenu] = useState({ name: '', price: '', category: 'Food', image_url: '' });

  // --- 1. โหลดข้อมูลทั้งหมด ---
  const fetchData = async () => {
    // โหลดโต๊ะ
    const { data: tData } = await supabase.from('restaurant_tables').select('*').order('table_number');
    if (tData) setTables(tData);

    // โหลดออเดอร์ (เฉพาะที่ยังไม่เสร็จ)
    const { data: oData } = await supabase.from('orders').select('*').neq('status', 'completed').order('created_at', { ascending: true });
    if (oData) setOrders(oData);

    // โหลดเมนู
    const { data: mData } = await supabase.from('restaurant_menus').select('*').order('id');
    if (mData) setMenus(mData);
  };

  useEffect(() => {
    fetchData();

    // เปิด Realtime (ให้ออเดอร์เด้งเอง)
    const channel = supabase
      .channel('kitchen-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => fetchData())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // --- 2. ฟังก์ชันจัดการโต๊ะ ---
  const addTable = async () => {
    const nextNumber = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1;
    await supabase.from('restaurant_tables').insert([{ table_number: nextNumber, status: 'available' }]);
    fetchData();
  };

  const toggleTable = async (id, currentStatus) => {
    const newStatus = currentStatus === 'available' ? 'occupied' : 'available';
    const newSessionKey = newStatus === 'occupied' ? Math.random().toString(36).substring(2, 10) : null;
    await supabase.from('restaurant_tables').update({ status: newStatus, session_key: newSessionKey }).eq('id', id);
    fetchData();
  };

  // --- 3. ฟังก์ชันจัดการเมนู ---
  const handleAddMenu = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('restaurant_menus').insert([newMenu]);
    if (error) alert("เพิ่มไม่สำเร็จ: " + error.message);
    else {
      setNewMenu({ name: '', price: '', category: 'Food', image_url: '' }); // Reset Form
      alert("เพิ่มเมนูเรียบร้อย!");
      fetchData();
    }
  };

  const handleDeleteMenu = async (id) => {
    if(!confirm("ยืนยันลบเมนูนี้?")) return;
    await supabase.from('restaurant_menus').delete().eq('id', id);
    fetchData();
  };

  // --- 4. ฟังก์ชันจัดการออเดอร์ ---
  const updateOrderStatus = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4 text-white font-sans">
      {/* Navbar */}
      <div className="flex justify-between items-center mb-6 bg-gray-800 p-4 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold text-orange-400">🔥 Kitchen & Manager</h1>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('tables')} className={`px-4 py-2 rounded-lg font-bold ${activeTab === 'tables' ? 'bg-orange-500' : 'bg-gray-700'}`}>จัดการโต๊ะ</button>
          <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded-lg font-bold ${activeTab === 'orders' ? 'bg-orange-500' : 'bg-gray-700'}`}>ออเดอร์ ({orders.length})</button>
          <button onClick={() => setActiveTab('menu')} className={`px-4 py-2 rounded-lg font-bold ${activeTab === 'menu' ? 'bg-orange-500' : 'bg-gray-700'}`}>จัดการเมนู</button>
        </div>
      </div>

      {/* --- ส่วนที่ 1: จัดการโต๊ะ --- */}
      {activeTab === 'tables' && (
        <div>
          <div className="flex justify-end mb-4"><button onClick={addTable} className="bg-green-600 px-4 py-2 rounded-lg font-bold hover:bg-green-500">+ เพิ่มโต๊ะ</button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tables.map((t) => (
              <div key={t.id} className={`p-4 rounded-xl border-2 text-center ${t.status === 'available' ? 'border-green-500 bg-gray-800' : 'border-red-500 bg-gray-800'}`}>
                <h2 className="text-3xl font-bold mb-2">{t.table_number}</h2>
                <div className={`text-xs px-2 py-1 rounded inline-block mb-2 ${t.status === 'available' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                  {t.status === 'available' ? 'ว่าง' : 'มีลูกค้า'}
                </div>
                <button onClick={() => toggleTable(t.id, t.status)} className={`w-full py-2 rounded font-bold ${t.status === 'available' ? 'bg-green-600' : 'bg-red-600'}`}>
                  {t.status === 'available' ? 'เปิดโต๊ะ' : 'เช็คบิล'}
                </button>
                {t.session_key && <p className="mt-2 text-xs text-gray-500">Key: {t.session_key}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- ส่วนที่ 2: ออเดอร์เข้า --- */}
      {activeTab === 'orders' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.length === 0 && <p className="text-gray-500 text-center col-span-3">ยังไม่มีออเดอร์ใหม่...</p>}
          {orders.map((order) => (
            <div key={order.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg animate-pulse-slow">
              <div className="flex justify-between border-b border-gray-700 pb-2 mb-2">
                <span className="text-xl font-bold text-orange-400">โต๊ะ {order.table_number}</span>
                <span className="text-sm text-gray-400">{new Date(order.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
              <div className="mb-4">
                {order.items && order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-gray-300 py-1 border-b border-gray-700 last:border-0">
                    <span>{item.name} x{item.quantity}</span>
                    <span>{item.price * item.quantity}.-</span>
                  </div>
                ))}
                <div className="mt-2 text-right font-bold text-xl">รวม {order.total_price}.-</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => updateOrderStatus(order.id, 'served')} className="flex-1 bg-blue-600 hover:bg-blue-500 py-2 rounded text-sm">เสิร์ฟแล้ว</button>
                <button onClick={() => updateOrderStatus(order.id, 'completed')} className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded text-sm">รับเงิน/จบ</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- ส่วนที่ 3: จัดการเมนู --- */}
      {activeTab === 'menu' && (
        <div className="max-w-4xl mx-auto">
          {/* ฟอร์มเพิ่มเมนู */}
          <form onSubmit={handleAddMenu} className="bg-gray-800 p-4 rounded-xl mb-6 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
            <div className="col-span-2 md:col-span-2"><label className="text-xs text-gray-400">ชื่อเมนู</label><input required className="w-full bg-gray-700 p-2 rounded text-white" value={newMenu.name} onChange={e => setNewMenu({...newMenu, name: e.target.value})} /></div>
            <div><label className="text-xs text-gray-400">ราคา</label><input required type="number" className="w-full bg-gray-700 p-2 rounded text-white" value={newMenu.price} onChange={e => setNewMenu({...newMenu, price: e.target.value})} /></div>
            <div><label className="text-xs text-gray-400">หมวดหมู่</label>
              <select className="w-full bg-gray-700 p-2 rounded text-white" value={newMenu.category} onChange={e => setNewMenu({...newMenu, category: e.target.value})}>
                <option value="Food">อาหาร</option><option value="Drink">เครื่องดื่ม</option><option value="Dessert">ของหวาน</option>
              </select>
            </div>
            <button type="submit" className="bg-orange-500 hover:bg-orange-400 p-2 rounded font-bold h-10">เพิ่ม +</button>
          </form>
          
          {/* รายการเมนู */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            {menus.map((m) => (
              <div key={m.id} className="flex justify-between items-center p-3 border-b border-gray-700 last:border-0 hover:bg-gray-750">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center overflow-hidden">
                    {m.image_url ? <img src={m.image_url} className="w-full h-full object-cover"/> : <span>🍽️</span>}
                  </div>
                  <div>
                    <p className="font-bold">{m.name}</p>
                    <p className="text-xs text-gray-400">{m.category} | {m.price} บาท</p>
                  </div>
                </div>
                <button onClick={() => handleDeleteMenu(m.id)} className="text-red-400 hover:text-red-300 px-3 py-1 border border-red-500 rounded text-xs">ลบ</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}