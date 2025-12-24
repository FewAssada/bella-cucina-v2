"use client";
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function KitchenPage() {
  const [activeTab, setActiveTab] = useState('tables'); 
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', category: 'Food', image_url: '' });
  
  // State สำหรับการเลือกออเดอร์ (เพื่อลบ)
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());

  // --- 1. โหลดข้อมูล Realtime ---
  const fetchData = async () => {
    const { data: t } = await supabase.from('restaurant_tables').select('*').order('table_number');
    if (t) setTables(t);

    // ดึงออเดอร์ทั้งหมด (เรียงจากล่าสุดก่อน)
    const { data: o } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (o) setOrders(o);

    const { data: m } = await supabase.from('restaurant_menus').select('*').order('id');
    if (m) setMenus(m);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('kitchen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, fetchData)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // --- 2. Logic จัดการออเดอร์ (เลือก, ลบ, โหลดไฟล์) ---
  
  // เลือก/ไม่เลือก ออเดอร์
  const toggleSelectOrder = (id) => {
    const newSelected = new Set(selectedOrderIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedOrderIds(newSelected);
  };

  // เลือกทั้งหมด / ยกเลิกทั้งหมด
  const toggleSelectAll = () => {
    if (selectedOrderIds.size === orders.length) {
        setSelectedOrderIds(new Set()); // ยกเลิกทั้งหมด
    } else {
        setSelectedOrderIds(new Set(orders.map(o => o.id))); // เลือกทั้งหมด
    }
  };

  // ลบออเดอร์ที่เลือก
  const deleteSelectedOrders = async () => {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return alert("กรุณาเลือกรายการที่จะลบก่อนครับ");
    if (!confirm(`ยืนยันลบ ${ids.length} รายการ?`)) return;

    const { error } = await supabase.from('orders').delete().in('id', ids);
    if (error) alert("ลบไม่สำเร็จ: " + error.message);
    else {
        setSelectedOrderIds(new Set()); // เคลียร์การเลือก
        fetchData();
    }
  };

  // ดาวน์โหลดเป็น .txt
  const exportToTxt = () => {
    if (orders.length === 0) return alert("ไม่มีข้อมูลให้ดาวน์โหลด");
    
    let content = "รายการออเดอร์ทั้งหมด\n==========================\n\n";
    orders.forEach(o => {
        content += `โต๊ะ: ${o.table_number} | สถานะ: ${o.status}\n`;
        content += `เวลา: ${new Date(o.created_at).toLocaleString('th-TH')}\n`;
        content += `รายการ:\n`;
        o.items.forEach(item => {
            content += `  - ${item.name} x${item.quantity} (@${item.price}) = ${item.price * item.quantity} บาท\n`;
        });
        content += `ยอดรวม: ${o.total_price} บาท\n`;
        content += `--------------------------\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders_export_${new Date().toISOString().slice(0,10)}.txt`;
    link.click();
  };

  // --- ฟังก์ชันอื่นๆ ---
  const addTable = async () => {
    const next = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1;
    await supabase.from('restaurant_tables').insert([{ table_number: next, status: 'available' }]);
    fetchData();
  };
  const toggleTable = async (id, status) => {
    const newStatus = status === 'available' ? 'occupied' : 'available';
    const key = newStatus === 'occupied' ? Math.random().toString(36).substring(2, 10) : null;
    await supabase.from('restaurant_tables').update({ status: newStatus, session_key: key }).eq('id', id);
    fetchData();
  };
  const handleAddMenu = async (e) => {
    e.preventDefault();
    await supabase.from('restaurant_menus').insert([newMenu]);
    setNewMenu({ name: '', price: '', category: 'Food', image_url: '' });
    fetchData();
  };
  const deleteMenu = async (id) => {
    if(confirm("ลบเมนูนี้?")) { await supabase.from('restaurant_menus').delete().eq('id', id); fetchData(); }
  };
  const updateOrder = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-[#0f172a] p-6 text-white font-sans">
      
      {/* Header (แบบเดิม) */}
      <div className="flex justify-between items-center mb-8 sticky top-0 bg-[#0f172a] z-50 py-2 border-b border-gray-800">
        <div className="flex items-center gap-3">
           <span className="text-3xl">👨‍🍳</span>
           <h1 className="text-2xl font-bold">ครัว & จัดการร้าน</h1>
        </div>

        <div className="flex bg-gray-800 p-1 rounded-lg">
           <button onClick={() => setActiveTab('orders')} className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'orders' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>
             ออเดอร์ {orders.filter(o => o.status !== 'completed').length > 0 && <span className="ml-1 bg-red-500 text-xs px-1.5 rounded-full">{orders.filter(o => o.status !== 'completed').length}</span>}
           </button>
           <button onClick={() => setActiveTab('menu')} className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'menu' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>เมนู</button>
           <button onClick={() => setActiveTab('tables')} className={`px-4 py-2 rounded-md font-bold transition-all ${activeTab === 'tables' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>โต๊ะ</button>
        </div>
      </div>

      {/* --- ส่วนแสดงผล --- */}

      {/* 1. จัดการโต๊ะ */}
      {activeTab === 'tables' && (
        <div className="animate-fade-in">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-300">จัดการโต๊ะ</h2>
            <button onClick={addTable} className="bg-teal-500 hover:bg-teal-600 px-4 py-2 rounded-lg font-bold shadow-lg">+ เพิ่มโต๊ะ</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {tables.map((t) => (
              <div key={t.id} className={`p-6 rounded-2xl border-2 transition-all ${t.status === 'available' ? 'bg-gray-800 border-green-500' : 'bg-gray-800 border-red-500'}`}>
                <h3 className="text-4xl font-black text-center mb-2">{t.table_number}</h3>
                <div className="text-center mb-4"><span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${t.status === 'available' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>{t.status === 'available' ? 'ว่าง' : 'มีลูกค้า'}</span></div>
                <button onClick={() => toggleTable(t.id, t.status)} className={`w-full py-2 rounded-lg font-bold ${t.status === 'available' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}>{t.status === 'available' ? 'เปิดโต๊ะ' : 'เช็คบิล'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. หน้าออเดอร์ (อัปเกรดใหม่!) */}
      {activeTab === 'orders' && (
        <div className="animate-fade-in">
           <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
              <h2 className="text-xl font-bold text-gray-300">รายการออเดอร์ 📝</h2>
              
              {/* ปุ่มจัดการออเดอร์ */}
              <div className="flex gap-2 w-full md:w-auto">
                <button onClick={toggleSelectAll} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-bold border border-gray-600">
                    {selectedOrderIds.size === orders.length && orders.length > 0 ? '❌ ไม่เลือกเลย' : '✅ เลือกทั้งหมด'}
                </button>
                
                {selectedOrderIds.size > 0 && (
                    <button onClick={deleteSelectedOrders} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold shadow-lg animate-pulse">
                        🗑️ ลบ {selectedOrderIds.size} รายการ
                    </button>
                )}

                <button onClick={exportToTxt} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-bold shadow-lg flex items-center gap-2">
                    📄 โหลด .txt
                </button>
              </div>
           </div>

           {/* รายการออเดอร์ */}
           <div className="grid grid-cols-1 gap-4">
             {orders.length === 0 && <p className="text-gray-500 text-center py-10">ยังไม่มีประวัติออเดอร์</p>}
             
             {orders.map((o) => (
               <div key={o.id} className={`bg-gray-800 p-4 rounded-xl border transition-all flex flex-col md:flex-row gap-4 ${selectedOrderIds.has(o.id) ? 'border-blue-500 bg-blue-900/20' : 'border-gray-700'}`}>
                 
                 {/* Checkbox เลือก */}
                 <div className="flex items-center justify-center md:justify-start">
                    <input 
                        type="checkbox" 
                        checked={selectedOrderIds.has(o.id)} 
                        onChange={() => toggleSelectOrder(o.id)}
                        className="w-6 h-6 rounded cursor-pointer accent-blue-500"
                    />
                 </div>

                 {/* ข้อมูลออเดอร์ */}
                 <div className="flex-1">
                     <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-2">
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-orange-400">โต๊ะ {o.table_number}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${o.status === 'pending' ? 'bg-yellow-600' : o.status === 'completed' ? 'bg-green-600' : 'bg-blue-600'}`}>
                                {o.status === 'pending' ? 'รอทำ' : o.status === 'completed' ? 'เสร็จสิ้น' : 'กำลังทำ'}
                            </span>
                        </div>
                        <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})} น.</span>
                     </div>
                     
                     {/* รายการอาหาร + ราคาต่อหน่วย */}
                     <div className="space-y-1 mb-2 text-gray-300 text-sm">
                        {o.items.map((item, i) => (
                          <div key={i} className="flex justify-between hover:bg-gray-700/30 p-1 rounded">
                            <span>{item.name} <span className="text-gray-500">x{item.quantity}</span></span>
                            <span className="font-mono text-gray-400">
                                <span className="text-xs mr-2">(@{item.price})</span> 
                                {item.price * item.quantity}.-
                            </span>
                          </div>
                        ))}
                     </div>
                     
                     <div className="flex justify-end pt-2 border-t border-gray-700">
                        <span className="text-lg font-bold text-green-400">รวม {o.total_price} บาท</span>
                     </div>
                 </div>

                 {/* ปุ่ม Action สถานะ */}
                 <div className="flex flex-col gap-2 justify-center w-full md:w-32">
                    {o.status === 'pending' && <button onClick={() => updateOrder(o.id, 'cooking')} className="bg-yellow-600 py-2 rounded text-sm font-bold hover:bg-yellow-500">รับออเดอร์</button>}
                    {o.status === 'cooking' && <button onClick={() => updateOrder(o.id, 'served')} className="bg-blue-600 py-2 rounded text-sm font-bold hover:bg-blue-500">เสิร์ฟแล้ว</button>}
                    {o.status === 'served' && <button onClick={() => updateOrder(o.id, 'completed')} className="bg-green-600 py-2 rounded text-sm font-bold hover:bg-green-500">เช็คบิล/จบ</button>}
                    {o.status === 'completed' && <span className="text-center text-green-500 text-sm font-bold">✅ เรียบร้อย</span>}
                 </div>

               </div>
             ))}
           </div>
        </div>
      )}

      {/* 3. จัดการเมนู */}
      {activeTab === 'menu' && (
        <div className="animate-fade-in max-w-4xl mx-auto">
           <h2 className="text-xl font-bold text-gray-300 mb-4">จัดการเมนูอาหาร 📖</h2>
           <form onSubmit={handleAddMenu} className="bg-gray-800 p-4 rounded-xl mb-6 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <input className="bg-gray-700 text-white px-3 py-2 rounded" placeholder="ชื่อเมนู" value={newMenu.name} onChange={e=>setNewMenu({...newMenu, name: e.target.value})} required />
              <input type="number" className="bg-gray-700 text-white px-3 py-2 rounded" placeholder="ราคา" value={newMenu.price} onChange={e=>setNewMenu({...newMenu, price: e.target.value})} required />
              <select className="bg-gray-700 text-white px-3 py-2 rounded" value={newMenu.category} onChange={e=>setNewMenu({...newMenu, category: e.target.value})}>
                <option value="Food">อาหาร</option><option value="Drink">เครื่องดื่ม</option><option value="Dessert">ของหวาน</option>
              </select>
              <button type="submit" className="bg-green-600 text-white px-3 py-2 rounded font-bold hover:bg-green-500">เพิ่มเมนู</button>
           </form>
           <div className="bg-gray-800 rounded-xl overflow-hidden">
             {menus.map((m) => (
               <div key={m.id} className="flex justify-between items-center p-3 border-b border-gray-700 hover:bg-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-600 rounded overflow-hidden">{m.image_url ? <img src={m.image_url} className="w-full h-full object-cover"/> : '🍽️'}</div>
                    <div><p className="font-bold">{m.name}</p><p className="text-xs text-gray-400">{m.category} | {m.price} บาท</p></div>
                  </div>
                  <button onClick={() => deleteMenu(m.id)} className="text-red-400 text-sm hover:underline">ลบ</button>
               </div>
             ))}
           </div>
        </div>
      )}

      <style jsx global>{`@keyframes fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }`}</style>
    </div>
  );
}