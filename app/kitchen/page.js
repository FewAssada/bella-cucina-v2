// @ts-nocheck
// app/kitchen/page.js
"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function KitchenPage() {
  const [activeTab, setActiveTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState(new Set());

  // ... (ฟังก์ชัน fetchOrders, useEffect, Export Notepad เหมือนเดิม) ...
  // เพื่อความชัวร์ ผมแนะนำให้ก๊อปปี้ส่วน toggleTableActive ด้านล่างนี้ไปแทนที่ของเดิมครับ
  
// ... โค้ดเดิมข้างบน ...

const toggleTable = async (id, currentStatus) => {
   // 1. ถ้ากำลังจะเปิดโต๊ะ (status เดิมคือ available) -> สร้างรหัสสุ่ม
   // 2. ถ้ากำลังจะปิดโต๊ะ -> ลบรหัสทิ้ง (เป็น null)
   const newStatus = currentStatus === 'available' ? 'occupied' : 'available';
   const newSessionKey = newStatus === 'occupied' 
     ? Math.random().toString(36).substring(2, 10) // สร้างรหัสสุ่ม เช่น 'x7z9a1b'
     : null; // ลบรหัสทิ้ง

   const { error } = await supabase
     .from('restaurant_tables')
     .update({ 
       status: newStatus,
       session_key: newSessionKey // <-- เพิ่มบรรทัดนี้เข้าไป
     })
     .eq('id', id);

   if (error) {
     console.error('Error updating status:', error);
   } else {
     fetchTables(); // โหลดข้อมูลใหม่
   }
};

// ... โค้ดเดิมข้างล่าง ...

  // ... (ส่วนที่เหลือของไฟล์เหมือนเดิมทุกประการ) ...
  // ถ้าคุณไม่มั่นใจ ให้ก๊อปปี้โค้ดเต็มด้านล่างนี้ไปวางทับทั้งไฟล์เลยครับ ปลอดภัยสุด 👇
  
  const fetchOrders = async () => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel('kitchen-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (activeTab === 'menu') fetchMenu();
    if (activeTab === 'tables') fetchTables();
  }, [activeTab]);

  const fetchMenu = async () => { const { data } = await supabase.from('menu_items').select('*').order('id'); if (data) setMenuItems(data); };
  const fetchTables = async () => { const { data } = await supabase.from('restaurant_tables').select('*').order('table_number'); if (data) setTables(data); };
  
  const exportToNotepad = () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const todaysOrders = orders.filter(o => o.created_at.startsWith(todayStr));
      if (todaysOrders.length === 0) { alert("วันนี้ยังไม่มีออเดอร์ครับ"); return; }
      let content = `=== สรุปยอดขายประจำวันที่ ${new Date().toLocaleDateString('th-TH')} ===\n\n`;
      let grandTotal = 0;
      todaysOrders.reverse().forEach((o, index) => {
         content += `รายการที่ ${index + 1} | เวลา: ${new Date(o.created_at).toLocaleTimeString('th-TH')}\n`;
         content += `โต๊ะ: ${o.table_number} (ลูกค้า: ${o.customer_name})\n`;
         content += `รายการอาหาร:\n${o.items}\n`;
         if(o.special_req) content += `Note: ${o.special_req}\n`;
         content += `ยอดรวม: ${o.total_price} บาท\n`;
         content += `สถานะ: ${o.status}\n`;
         content += `----------------------------------------\n`;
         grandTotal += o.total_price;
      });
      content += `\n=== รวมยอดขายทั้งสิ้น: ${grandTotal} บาท ===`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orders_${todayStr}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const updateStatus = async (id, status) => { await supabase.from('orders').update({ status }).eq('id', id); };
  const deleteOrder = async (id) => { if (!confirm("ลบออเดอร์นี้?")) return; await supabase.from('orders').delete().eq('id', id); const newSet = new Set(selectedOrders); newSet.delete(id); setSelectedOrders(newSet); };
  const toggleSelectOrder = (id) => { const newSet = new Set(selectedOrders); if (newSet.has(id)) newSet.delete(id); else newSet.add(id); setSelectedOrders(newSet); };
  const toggleSelectColumn = (status) => { const ordersInColumn = orders.filter(o => o.status === status); const idsInColumn = ordersInColumn.map(o => o.id); const allSelected = idsInColumn.every(id => selectedOrders.has(id)); const newSet = new Set(selectedOrders); if (allSelected) idsInColumn.forEach(id => newSet.delete(id)); else idsInColumn.forEach(id => newSet.add(id)); setSelectedOrders(newSet); };
  const deleteSelectedInColumn = async (status) => { const idsToDelete = Array.from(selectedOrders).filter(id => { const order = orders.find(o => o.id === id); return order && order.status === status; }); if (idsToDelete.length === 0) return; if (!confirm(`ยืนยันลบ ${idsToDelete.length} รายการ?`)) return; await supabase.from('orders').delete().in('id', idsToDelete); const newSet = new Set(selectedOrders); idsToDelete.forEach(id => newSet.delete(id)); setSelectedOrders(newSet); };
  const toggleMenuStatus = async (id, currentStatus) => { await supabase.from('menu_items').update({ is_active: !currentStatus }).eq('id', id); fetchMenu(); };
  const deleteMenuItem = async (id) => { if (confirm("ลบเมนู?")) { await supabase.from('menu_items').delete().eq('id', id); fetchMenu(); } };
  const addNewMenu = async () => { const name = prompt("ชื่อเมนู:"); if(!name) return; const price = prompt("ราคา:"); await supabase.from('menu_items').insert({ name, price: parseInt(price), is_active: true }); fetchMenu(); };
  const editMenuItem = async (item) => { const newName = prompt("แก้ไขชื่อเมนู:", item.name); if (newName === null) return; const newPrice = prompt("แก้ไขราคา:", item.price); if (newPrice === null) return; await supabase.from('menu_items').update({ name: newName, price: parseInt(newPrice) }).eq('id', item.id); fetchMenu(); };
  const addTable = async () => { const nextNum = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1; await supabase.from('restaurant_tables').insert({ table_number: nextNum, is_active: true }); fetchTables(); };
  const removeTable = async (id) => { if (confirm("ลบโต๊ะ?")) { await supabase.from('restaurant_tables').delete().eq('id', id); fetchTables(); } };
  const fmt = (n) => "฿" + n.toFixed(0);

  return (
    <div className="min-h-screen bg-[#0b1220] text-[#e8edf7] flex flex-col font-sans">
      <header className="bg-[#0b1220] border-b border-white/10 px-6 py-4 flex justify-between items-center shrink-0">
         <div className="flex items-center gap-4">
            <h1 className="font-bold text-xl flex items-center gap-2">👨‍🍳 ครัว & จัดการร้าน</h1>
            {activeTab === 'orders' && <button onClick={exportToNotepad} className="flex items-center gap-2 bg-[#2dd4bf]/10 text-[#2dd4bf] px-3 py-1.5 rounded-lg border border-[#2dd4bf]/20 hover:bg-[#2dd4bf]/20 transition text-sm font-bold">📥 โหลดออเดอร์วันนี้ (Notepad)</button>}
         </div>
         <div className="flex gap-2">
            {['orders', 'menu', 'tables'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg font-bold transition ${activeTab===tab ? 'bg-[#9bd5ff] text-black' : 'bg-white/10 hover:bg-white/20'}`}>
                {tab === 'orders' ? 'ออเดอร์' : tab === 'menu' ? 'เมนู' : 'โต๊ะ'}
              </button>
            ))}
            <a href="/" className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-900/20">ออก</a>
         </div>
      </header>

      <main className="flex-1 overflow-auto p-6 bg-[#0b1220]">
        {activeTab === 'orders' && (
          <div className="flex gap-6 min-w-[1200px] h-full overflow-x-auto pb-4">
             {['pending', 'preparing', 'ready', 'completed'].map(status => {
                const colOrders = orders.filter(o => o.status === status);
                const selectedInCol = colOrders.filter(o => selectedOrders.has(o.id)).length;
                const isAllSelected = colOrders.length > 0 && selectedInCol === colOrders.length;
                const title = status === 'pending' ? "รอดำเนินการ" : status === 'preparing' ? "กำลังทำ" : status === 'ready' ? "พร้อมเสิร์ฟ" : "เสร็จสิ้น";
                return (
                  <OrderColumn key={status} title={title} count={colOrders.length} selectedCount={selectedInCol} isAllSelected={isAllSelected} onToggleAll={() => toggleSelectColumn(status)} onDeleteSelected={() => deleteSelectedInColumn(status)}>
                    {colOrders.map(order => <OrderCard key={order.id} order={order} status={status} isSelected={selectedOrders.has(order.id)} onToggleSelect={() => toggleSelectOrder(order.id)} onAction={(nextStatus) => updateStatus(order.id, nextStatus)} onDelete={() => deleteOrder(order.id)} />)}
                  </OrderColumn>
                );
             })}
          </div>
        )}
        {activeTab === 'menu' && (
          <div className="max-w-4xl mx-auto space-y-6">
             <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold">จัดการเมนู</h2><button onClick={addNewMenu} className="bg-[#2dd4bf] text-black px-4 py-2 rounded-lg font-bold">+ เพิ่มเมนู</button></div>
             <div className="grid gap-3">
                {menuItems.map(item => (
                   <div key={item.id} className="flex items-center gap-4 bg-[#111a2e] p-4 rounded-lg border border-white/5 shadow-sm">
                      <div onClick={() => toggleMenuStatus(item.id, item.is_active)} className={`w-12 h-6 rounded-full relative cursor-pointer transition ${item.is_active ? 'bg-[#2dd4bf]' : 'bg-gray-600'}`}><div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${item.is_active ? 'left-6' : 'left-0.5'}`}></div></div>
                      <div className="flex-1"><div className={`font-bold text-lg ${!item.is_active && 'text-gray-500 line-through'}`}>{item.name}</div><div className="text-sm text-gray-400">{fmt(item.price)}</div></div>
                      <div className="flex gap-2"><button onClick={() => editMenuItem(item)} className="text-[#ffd166] hover:bg-white/5 p-2 rounded" title="แก้ไข">✏️</button><button onClick={() => deleteMenuItem(item.id)} className="text-[#f87171] hover:bg-white/5 p-2 rounded" title="ลบ">🗑️</button></div>
                   </div>
                ))}
             </div>
          </div>
        )}
        {activeTab === 'tables' && (
           <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold">จัดการโต๊ะ</h2><button onClick={addTable} className="bg-[#2dd4bf] text-black px-4 py-2 rounded-lg font-bold">+ เพิ่มโต๊ะ</button></div>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                 {tables.map(t => (
                    <div key={t.id} className={`p-6 rounded-xl border flex flex-col items-center relative group transition-all ${t.is_active ? 'bg-[#111a2e] border-[#2dd4bf]/50 shadow-[0_0_15px_rgba(45,212,191,0.1)]' : 'bg-red-900/10 border-red-500/30 grayscale'}`}>
                       <span className="text-3xl mb-2">🍽️</span>
                       <span className="font-bold text-xl mb-3">โต๊ะ {t.table_number}</span>
                       <button onClick={() => toggleTableActive(t.id, t.is_active)} className={`w-full py-2 rounded-lg font-bold text-sm mb-2 transition-all ${t.is_active ? 'bg-[#2dd4bf] text-black hover:opacity-90' : 'bg-red-600 text-white hover:bg-red-500'}`}>
                          {t.is_active ? 'เปิดอยู่ ✅' : 'ปิดอยู่ ⛔'}
                       </button>
                       <button onClick={() => removeTable(t.id)} className="absolute top-2 right-2 text-[#f87171] opacity-0 group-hover:opacity-100 p-1">✖</button>
                    </div>
                 ))}
              </div>
              <div className="mt-8 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg text-sm text-blue-200">
                💡 <b>ระบบ QR Fix:</b> กด "เปิดโต๊ะ" เพื่อรับลูกค้าใหม่ (ลูกค้าเก่าที่นั่งอยู่บ้านจะสั่งไม่ได้โดยอัตโนมัติ)
              </div>
           </div>
        )}
      </main>
    </div>
  );
}
// (Components OrderColumn, OrderCard เหมือนเดิม)
function OrderColumn({ title, count, children, selectedCount, isAllSelected, onToggleAll, onDeleteSelected }) { return (<div className="flex-1 min-w-[300px] bg-[#111a2e] rounded-xl flex flex-col h-full border border-white/5 relative"><div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#111a2e] rounded-t-xl sticky top-0 z-10"><div className="flex items-center gap-3">{count > 0 && <input type="checkbox" checked={isAllSelected} onChange={onToggleAll} className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 cursor-pointer" />}<span className="font-bold text-lg">{title}</span><span className="bg-white/10 px-2.5 py-0.5 rounded text-sm font-mono">{count}</span></div></div>{selectedCount > 0 && (<div className="absolute top-[60px] left-2 right-2 z-20 bg-[#f87171] text-white p-2 rounded-lg shadow-lg flex justify-between items-center animate-in fade-in slide-in-from-top-2"><span className="text-sm font-bold pl-2">เลือก {selectedCount} รายการ</span><button onClick={onDeleteSelected} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-bold">ลบที่เลือก</button></div>)}<div className="p-4 space-y-3 overflow-y-auto flex-1 custom-scrollbar pt-2">{children}</div></div>); }
function OrderCard({ order, status, isSelected, onToggleSelect, onAction, onDelete }) { const borderColor = status === 'pending' ? 'border-[#ffd166]' : status === 'preparing' ? 'border-blue-500' : status === 'ready' ? 'border-[#2dd4bf]' : 'border-gray-600'; const actionLabel = status === 'pending' ? 'รับออเดอร์' : status === 'preparing' ? 'ปรุงเสร็จ' : status === 'ready' ? 'จบงาน' : null; const actionColor = status === 'pending' ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : status === 'preparing' ? 'bg-teal-500/20 text-teal-400 hover:bg-teal-500/30' : 'bg-white/10 text-gray-300 hover:bg-white/20'; const nextStatus = status === 'pending' ? 'preparing' : status === 'preparing' ? 'ready' : status === 'ready' ? 'completed' : null; return (<div className={`bg-[#0b1220] p-4 rounded-lg border-l-4 ${borderColor} shadow-sm flex flex-col gap-3 relative group transition-all ${isSelected ? 'ring-2 ring-blue-500 bg-[#162032]' : ''}`}><div className="flex justify-between items-start pl-6"><div className="absolute top-4 left-3"><input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 cursor-pointer" /></div><div><div className="font-bold text-[#ffd166] text-lg">โต๊ะ {order.table_number}</div><div className="text-xs text-gray-400">{order.customer_name}</div></div><div className="text-right"><div className="font-bold text-[#2dd4bf]">฿{order.total_price}</div><div className="text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div></div></div><div className="bg-white/5 p-2 rounded text-sm text-gray-200 space-y-1 ml-6">{order.items.split('\n').map((item, i) => <div key={i}>{item}</div>)}</div>{order.special_req && <div className="text-[#fb923c] text-xs font-semibold ml-6">Note: {order.special_req}</div>}<div className="mt-auto pt-2 pl-6">{actionLabel && <button onClick={() => onAction(nextStatus)} className={`w-full py-2 rounded-lg font-bold text-sm transition-colors mb-2 ${actionColor}`}>{actionLabel}</button>}<button onClick={onDelete} className="w-full text-[#f87171] text-xs hover:underline opacity-60 hover:opacity-100">ลบรายการ</button></div></div>); }