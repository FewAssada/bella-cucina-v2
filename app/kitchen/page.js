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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [menuSubTab, setMenuSubTab] = useState('items'); // 'items' หรือ 'options'
  
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [menus, setMenus] = useState([]);
  const [options, setOptions] = useState([]); // 🔥 เก็บข้อมูลตัวเลือกเสริม
  
  // Settings & Forms
  const [settings, setSettings] = useState({ shop_name: '', shop_address: '', shop_phone: '', vat_rate: 7, receipt_footer: '' });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', price_special: '', category: 'Noodles', image_url: '', is_available: true });
  const [newOption, setNewOption] = useState({ name: '', price: '' }); // 🔥 ฟอร์มตัวเลือกใหม่
  const [editingId, setEditingId] = useState(null); 

  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  // POS State
  const [showBillModal, setShowBillModal] = useState(false);
  const [currentBillTable, setCurrentBillTable] = useState(null);
  const [billItems, setBillItems] = useState([]);
  const [billTotal, setBillTotal] = useState(0);
  const [cashReceived, setCashReceived] = useState('');

  // Voice State
  const orderBuffer = useRef([]);
  const bufferTimeout = useRef(null);
  const spokenOrderIds = useRef(new Set()); 

  useEffect(() => { if (sessionStorage.getItem("admin_auth") === "true") setIsAuthenticated(true); }, []);
  const handleLogin = (e) => { e.preventDefault(); if (pinInput === ADMIN_PIN) { setIsAuthenticated(true); sessionStorage.setItem("admin_auth", "true"); } else { alert("รหัสผิด!"); setPinInput(""); } };
  const handleLogout = () => { setIsAuthenticated(false); sessionStorage.removeItem("admin_auth"); };

  const stopSpeaking = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
  const speak = (text) => {
      if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = 'th-TH'; utterance.rate = 1.0; 
          window.speechSynthesis.speak(utterance);
      }
  };

  const fetchData = async () => {
    const { data: t } = await supabase.from('restaurant_tables').select('*').order('table_number'); if (t) setTables(t);
    const { data: m } = await supabase.from('restaurant_menus').select('*').order('id'); if (m) setMenus(m);
    const { data: opt } = await supabase.from('restaurant_options').select('*').order('id'); if (opt) setOptions(opt); // 🔥 ดึงตัวเลือก
    const { data: s } = await supabase.from('restaurant_settings').select('*').single(); if (s) setSettings(s);

    const startDate = `${filterDate} 00:00:00`; 
    const endDate = `${filterDate} 23:59:59`;
    
    const { data: activeOrders } = await supabase.from('orders').select('*').in('status', ['pending', 'cooking', 'served']).order('created_at', { ascending: true });
    const { data: historyOrders } = await supabase.from('orders').select('*').eq('status', 'completed').gte('created_at', startDate).lte('created_at', endDate).order('created_at', { ascending: false });

    let all = [];
    if (activeOrders) all = [...all, ...activeOrders];
    if (historyOrders) all = [...all, ...historyOrders];
    setOrders(all);

    if (activeOrders) activeOrders.forEach(o => spokenOrderIds.current.add(o.id));
  };

  useEffect(() => { 
      if (!isAuthenticated) return; 
      fetchData(); 
      const channel = supabase.channel('admin-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
            if(payload.eventType === 'INSERT') {
                const newOrder = payload.new;
                if (!spokenOrderIds.current.has(newOrder.id)) {
                    spokenOrderIds.current.add(newOrder.id); 
                    orderBuffer.current.push(newOrder);
                    if (bufferTimeout.current) clearTimeout(bufferTimeout.current);
                    bufferTimeout.current = setTimeout(() => {
                        const sortedOrders = [...orderBuffer.current].sort((a, b) => Number(a.table_number) - Number(b.table_number));
                        sortedOrders.forEach(order => { speak(`ออเดอร์ใหม่... โต๊ะ ${order.table_number}`); });
                        orderBuffer.current = [];
                        fetchData();
                    }, 1000);
                }
            } else {
                fetchData();
            }
        })
        .subscribe(); 
      return () => { supabase.removeChannel(channel); if (bufferTimeout.current) clearTimeout(bufferTimeout.current); }; 
  }, [isAuthenticated, filterDate]);

  // --- Logic Functions ---
  const handleSaveSettings = async () => {
      setIsSavingSettings(true);
      const { data: existing } = await supabase.from('restaurant_settings').select('id').single();
      if (existing) { await supabase.from('restaurant_settings').update(settings).eq('id', existing.id); } else { await supabase.from('restaurant_settings').insert([settings]); }
      setIsSavingSettings(false); alert("บันทึกการตั้งค่าเรียบร้อย! ✅");
  };

  const openCheckBill = (table) => {
      const activeForTable = orders.filter(o => o.table_number == table.table_number && o.status !== 'completed');
      if (activeForTable.length === 0) return alert("โต๊ะนี้ไม่มีรายการค้างครับ");
      let allItems = []; let total = 0;
      activeForTable.forEach(order => { allItems = [...allItems, ...order.items]; total += order.total_price; });
      setCurrentBillTable(table); setBillItems(allItems); setBillTotal(total); setCashReceived(''); setShowBillModal(true);
  };

  const confirmPayment = async () => {
      if (!currentBillTable) return;
      const activeForTable = orders.filter(o => o.table_number == currentBillTable.table_number && o.status !== 'completed');
      for (const order of activeForTable) { await supabase.from('orders').update({ status: 'completed', payment_status: 'paid_cash' }).eq('id', order.id); }
      await supabase.from('restaurant_tables').update({ status: 'available' }).eq('id', currentBillTable.id);
      setShowBillModal(false); setCashReceived(''); fetchData(); speak(`ปิดโต๊ะ ${currentBillTable.table_number} เรียบร้อย`);
  };

  const updateOrder = async (id, status) => { await supabase.from('orders').update({ status }).eq('id', id); fetchData(); };
  const deleteOrder = async (id) => { if(confirm("⚠️ ลบออเดอร์นี้ถาวร?")) { await supabase.from('orders').delete().eq('id', id); fetchData(); }};
  const addTable = async () => { const next = tables.length > 0 ? Math.max(...tables.map(t => t.table_number)) + 1 : 1; await supabase.from('restaurant_tables').insert([{ table_number: next, status: 'available' }]); fetchData(); };
  
  // Menu Handlers
  const handleSaveMenu = async (e) => { e.preventDefault(); const payload = { ...newMenu, price_special: newMenu.price_special ? newMenu.price_special : null }; if (editingId) { await supabase.from('restaurant_menus').update(payload).eq('id', editingId); } else { await supabase.from('restaurant_menus').insert([payload]); } setNewMenu({ name: '', price: '', price_special: '', category: 'Noodles', image_url: '', is_available: true }); setEditingId(null); fetchData(); };
  const startEditMenu = (menuItem) => { setNewMenu(menuItem); setEditingId(menuItem.id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const cancelEdit = () => { setNewMenu({ name: '', price: '', price_special: '', category: 'Noodles', image_url: '', is_available: true }); setEditingId(null); };
  const toggleMenuAvailability = async (id, currentStatus) => { await supabase.from('restaurant_menus').update({ is_available: !currentStatus }).eq('id', id); fetchData(); };
  const deleteMenu = async (id) => { if(confirm("ลบเมนูนี้ถาวร?")) await supabase.from('restaurant_menus').delete().eq('id', id); fetchData(); };

  // 🔥 Option Handlers (เพิ่มใหม่)
  const handleSaveOption = async (e) => {
      e.preventDefault();
      await supabase.from('restaurant_options').insert([newOption]);
      setNewOption({ name: '', price: '' });
      fetchData();
  };
  const deleteOption = async (id) => {
      if(confirm("ลบตัวเลือกนี้?")) {
          await supabase.from('restaurant_options').delete().eq('id', id);
          fetchData();
      }
  };

  const totalSalesToday = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.total_price, 0);
  const totalOrdersToday = orders.filter(o => o.status === 'completed').length;
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'cooking').length;

  if (!isAuthenticated) return ( <div className="min-h-screen bg-gray-100 flex items-center justify-center font-sans"><div className="bg-white p-8 rounded-2xl shadow-xl w-96 text-center"><h1 className="text-2xl font-bold text-gray-800 mb-2">Bella POS</h1><form onSubmit={handleLogin}><input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-center text-gray-800 text-lg rounded-xl p-3 mb-4 focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Enter PIN" autoFocus/><button className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition-all">เข้าสู่ระบบ</button></form></div></div> );

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-sans flex text-gray-800">
      <aside className="w-20 lg:w-64 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col fixed h-full z-20 transition-all">
          <div className="p-6 flex items-center gap-3 justify-center lg:justify-start"><div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-2xl">🥗</div><div className="hidden lg:block"><h1 className="font-bold text-lg leading-tight">{settings.shop_name || 'My POS'}</h1></div></div>
          <nav className="flex-1 px-4 space-y-2 mt-4">{[{ id: 'dashboard', icon: '📊', label: 'ภาพรวม' }, { id: 'pos', icon: '🏪', label: 'ขายหน้าร้าน' }, { id: 'kitchen', icon: '👨‍🍳', label: 'หน้าจอครัว' }, { id: 'menu', icon: '📝', label: 'จัดการเมนู' }, { id: 'settings', icon: '⚙️', label: 'ตั้งค่าระบบ' }].map((item) => (<button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${activeTab === item.id ? 'bg-orange-600 text-white shadow-lg shadow-orange-200' : 'text-gray-500 hover:bg-gray-50 hover:text-orange-600'}`}><span className="text-xl">{item.icon}</span><span className="hidden lg:block font-medium">{item.label}</span></button>))}</nav>
          <div className="p-4 border-t border-gray-100"><button onClick={handleLogout} className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all"><span>🚪</span><span className="hidden lg:block font-medium">ออก</span></button></div>
      </aside>

      <main className="flex-1 ml-20 lg:ml-64 p-4 lg:p-8 overflow-y-auto min-h-screen">
          <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
              <div><h2 className="text-2xl font-bold text-gray-800">{activeTab === 'dashboard' ? 'แดชบอร์ดภาพรวม' : activeTab === 'pos' ? 'ขายหน้าร้าน (POS)' : activeTab === 'kitchen' ? 'รายการออเดอร์ (ครัว)' : activeTab === 'menu' ? 'จัดการเมนูอาหาร' : 'ตั้งค่าระบบ'}</h2>{activeTab === 'dashboard' && (<div className="flex items-center gap-2 mt-1"><span className="text-sm text-gray-500">📅 ประจำวันที่:</span><input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-1 outline-none focus:border-orange-500 cursor-pointer shadow-sm hover:border-orange-300 transition-colors"/></div>)}</div>
              <div className="flex gap-2"><button onClick={() => speak("เทส")} className="bg-white p-2 rounded-full shadow-sm text-gray-500 hover:text-orange-600">🔊</button><button onClick={stopSpeaking} className="bg-white p-2 rounded-full shadow-sm text-gray-500 hover:text-red-600">🔇</button></div>
          </header>

          {activeTab === 'dashboard' && (
              <div className="animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><h3 className="text-gray-500 text-sm">ยอดขาย</h3><p className="text-3xl font-bold text-gray-800">฿{totalSalesToday.toLocaleString()}</p></div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><h3 className="text-gray-500 text-sm">ออเดอร์สำเร็จ</h3><p className="text-3xl font-bold text-gray-800">{totalOrdersToday}</p></div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><h3 className="text-gray-500 text-sm">กำลังทำ</h3><p className="text-3xl font-bold text-gray-800">{pendingOrders}</p></div>
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="p-6 border-b border-gray-100"><h3 className="font-bold">รายการออเดอร์ล่าสุด</h3></div>
                      <table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="p-4">เวลา</th><th className="p-4">โต๊ะ</th><th className="p-4">ยอดเงิน</th><th className="p-4">สถานะ</th><th className="p-4 text-right">จัดการ</th></tr></thead><tbody>{orders.map(o => (<tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50"><td className="p-4 text-gray-500">{new Date(o.created_at).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</td><td className="p-4 font-bold">โต๊ะ {o.table_number}</td><td className="p-4">฿{o.total_price}</td><td className="p-4"><span className={`px-2 py-1 rounded-full text-xs ${o.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{o.status}</span></td><td className="p-4 text-right"><button onClick={() => deleteOrder(o.id)} className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors">🗑️</button></td></tr>))}</tbody></table>
                  </div>
              </div>
          )}

          {activeTab === 'pos' && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-fade-in">
                  {tables.map((t) => {
                      const tableActiveOrders = orders.filter(o => o.table_number == t.table_number && o.status !== 'completed');
                      const isOccupied = tableActiveOrders.length > 0;
                      const total = tableActiveOrders.reduce((s, o) => s + o.total_price, 0);
                      return (<div key={t.id} className={`relative p-6 rounded-2xl border-2 transition-all cursor-pointer group hover:shadow-lg ${isOccupied ? 'bg-white border-orange-500 shadow-md' : 'bg-gray-50 border-gray-200 border-dashed'}`}><div className="flex justify-between items-start mb-4"><span className={`text-4xl font-bold ${isOccupied ? 'text-gray-800' : 'text-gray-400'}`}>{t.table_number}</span><span className={`px-2 py-1 rounded-lg text-xs font-bold ${isOccupied ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-500'}`}>{isOccupied ? 'ไม่ว่าง' : 'ว่าง'}</span></div>{isOccupied ? ( <div><p className="text-gray-500 text-sm mb-2">{tableActiveOrders.length} ออเดอร์</p><p className="text-2xl font-bold text-orange-600 mb-4">฿{total}</p><button onClick={() => openCheckBill(t)} className="w-full bg-orange-600 text-white py-2 rounded-xl font-bold shadow-lg shadow-orange-200 active:scale-95 transition-transform hover:bg-orange-700">💰 เช็คบิล</button></div> ) : ( <div className="h-[88px] flex items-center justify-center text-gray-300 text-sm">รอลูกค้า...</div> )}</div>);
                  })}
                  <button onClick={addTable} className="border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center text-gray-400 hover:text-orange-500 hover:border-orange-500 hover:bg-white transition-all h-[200px]"><span className="text-4xl mb-2">+</span>เพิ่มโต๊ะ</button>
              </div>
          )}

          {activeTab === 'kitchen' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                  {orders.filter(o => o.status !== 'completed').map((order) => ( <div key={order.id} className={`bg-white rounded-2xl shadow-sm border-l-4 overflow-hidden ${order.status === 'pending' ? 'border-orange-500' : order.status === 'cooking' ? 'border-blue-500' : 'border-green-500'}`}><div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50"><h3 className="font-bold text-xl text-gray-800">โต๊ะ {order.table_number}</h3><span className="text-xs text-gray-400">#{order.id.toString().slice(-4)}</span></div><div className="p-4 space-y-2">{order.items.map((item, i) => ( <div key={i} className="flex justify-between items-center text-gray-600"><span>{item.name} {item.variant && <span className="text-orange-500 text-xs">({item.variant})</span>}</span><span className="font-bold bg-gray-100 px-2 rounded">x{item.quantity}</span></div> ))}</div><div className="p-4 pt-0">{order.status === 'pending' && <button onClick={()=>updateOrder(order.id, 'cooking')} className="w-full bg-orange-100 text-orange-700 py-2 rounded-xl font-bold hover:bg-orange-200">ทำอาหาร</button>}{order.status === 'cooking' && <button onClick={()=>updateOrder(order.id, 'served')} className="w-full bg-blue-100 text-blue-700 py-2 rounded-xl font-bold hover:bg-blue-200">เสิร์ฟ</button>}{order.status === 'served' && <button onClick={()=>updateOrder(order.id, 'completed')} className="w-full bg-green-100 text-green-700 py-2 rounded-xl font-bold hover:bg-green-200">จบงาน</button>}</div></div> ))}
                  {orders.filter(o => o.status !== 'completed').length === 0 && <div className="col-span-full text-center py-20 text-gray-400"><div className="text-6xl mb-4">😴</div>ยังไม่มีออเดอร์เข้าครับ</div>}
              </div>
          )}

          {activeTab === 'menu' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                  {/* 🔥 Tab ย่อย: รายการเมนู / ส่วนเพิ่ม */}
                  <div className="flex border-b border-gray-100 bg-gray-50/50">
                      <button onClick={() => setMenuSubTab('items')} className={`px-6 py-4 font-bold text-sm transition-colors ${menuSubTab === 'items' ? 'text-orange-600 border-b-2 border-orange-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>รายการเมนู</button>
                      <button onClick={() => setMenuSubTab('options')} className={`px-6 py-4 font-bold text-sm transition-colors ${menuSubTab === 'options' ? 'text-orange-600 border-b-2 border-orange-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}>ส่วนเพิ่ม (Extras)</button>
                  </div>

                  {/* 1. จัดการเมนูหลัก */}
                  {menuSubTab === 'items' && (
                      <div>
                          <div className="p-6 border-b border-gray-100 bg-gray-50/30">
                              <h3 className="font-bold text-gray-800 mb-4">{editingId ? '✏️ แก้ไขเมนู' : '📝 เพิ่มเมนูใหม่'}</h3>
                              <form onSubmit={handleSaveMenu} className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                  <div className="md:col-span-2"><input className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" placeholder="ชื่อเมนู" value={newMenu.name} onChange={e=>setNewMenu({...newMenu, name: e.target.value})} required /></div>
                                  <div className="md:col-span-1"><input type="number" className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" placeholder="ราคา" value={newMenu.price} onChange={e=>setNewMenu({...newMenu, price: e.target.value})} required /></div>
                                  <div className="md:col-span-1"><select className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" value={newMenu.category} onChange={e=>setNewMenu({...newMenu, category: e.target.value})}><option value="Noodles">ก๋วยเตี๋ยว</option><option value="GaoLao">เกาเหลา</option><option value="Sides">ของทานเล่น</option><option value="Drinks">เครื่องดื่ม</option></select></div>
                                  <div className="md:col-span-2 flex gap-2"><button type="submit" className="flex-1 bg-green-600 text-white rounded-xl font-bold hover:bg-green-500 shadow-md shadow-green-200">{editingId ? 'บันทึก' : 'เพิ่มเมนู'}</button>{editingId && <button type="button" onClick={cancelEdit} className="px-4 bg-gray-200 text-gray-600 rounded-xl">ยกเลิก</button>}</div>
                                  <div className="md:col-span-6"><input className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm text-gray-500 outline-none" placeholder="URL รูปภาพ" value={newMenu.image_url || ''} onChange={e=>setNewMenu({...newMenu, image_url: e.target.value})} /></div>
                              </form>
                          </div>
                          <table className="w-full text-left"><thead className="bg-gray-50 text-gray-500 border-b border-gray-100"><tr><th className="p-4">รูป</th><th className="p-4">ชื่อ</th><th className="p-4">ราคา</th><th className="p-4 text-center">สถานะ</th><th className="p-4 text-right">จัดการ</th></tr></thead><tbody>{menus.map((m) => (<tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50"><td className="p-4"><img src={m.image_url || 'https://via.placeholder.com/50'} className="w-12 h-12 rounded-lg object-cover bg-gray-100"/></td><td className="p-4 font-medium text-gray-800">{m.name} <span className="text-xs text-gray-400 block">{m.category}</span></td><td className="p-4 font-bold text-orange-600">{m.price}</td><td className="p-4 text-center"><button onClick={() => toggleMenuAvailability(m.id, m.is_available)} className={`px-3 py-1 rounded-full text-xs font-bold ${m.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.is_available ? 'ขาย' : 'หมด'}</button></td><td className="p-4 text-right"><button onClick={() => startEditMenu(m)} className="text-blue-500 hover:text-blue-700 mr-3">แก้ไข</button><button onClick={() => deleteMenu(m.id)} className="text-red-500 hover:text-red-700">ลบ</button></td></tr>))}</tbody></table>
                      </div>
                  )}

                  {/* 🔥 2. จัดการส่วนเพิ่ม (Extras) */}
                  {menuSubTab === 'options' && (
                      <div>
                          <div className="p-6 border-b border-gray-100 bg-gray-50/30">
                              <h3 className="font-bold text-gray-800 mb-4">➕ เพิ่มตัวเลือกเสริม (Toppings)</h3>
                              <form onSubmit={handleSaveOption} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                  <div className="md:col-span-2"><input className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" placeholder="ชื่อตัวเลือก (เช่น เพิ่มลูกชิ้น)" value={newOption.name} onChange={e=>setNewOption({...newOption, name: e.target.value})} required /></div>
                                  <div className="md:col-span-1"><input type="number" className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" placeholder="ราคาเพิ่ม (0 = ฟรี)" value={newOption.price} onChange={e=>setNewOption({...newOption, price: e.target.value})} required /></div>
                                  <div className="md:col-span-1"><button type="submit" className="w-full bg-green-600 text-white rounded-xl font-bold hover:bg-green-500 shadow-md shadow-green-200 py-2">เพิ่มรายการ</button></div>
                              </form>
                          </div>
                          <table className="w-full text-left">
                              <thead className="bg-gray-50 text-gray-500 border-b border-gray-100"><tr><th className="p-4">ชื่อตัวเลือก</th><th className="p-4">ราคาบวกเพิ่ม</th><th className="p-4 text-right">จัดการ</th></tr></thead>
                              <tbody>
                                  {options.map((opt) => (
                                      <tr key={opt.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                          <td className="p-4 font-medium text-gray-800">{opt.name}</td>
                                          <td className="p-4 font-bold text-green-600">+{opt.price} บาท</td>
                                          <td className="p-4 text-right"><button onClick={() => deleteOption(opt.id)} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg">ลบ</button></td>
                                      </tr>
                                  ))}
                                  {options.length === 0 && <tr><td colSpan="3" className="p-8 text-center text-gray-400">ยังไม่มีตัวเลือกเสริม</td></tr>}
                              </tbody>
                          </table>
                      </div>
                  )}
              </div>
          )}

          {activeTab === 'settings' && (
              <div className="max-w-2xl mx-auto animate-fade-in">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6"><div className="p-6 border-b border-gray-100"><h3 className="font-bold text-lg text-gray-800">🏪 ข้อมูลร้านค้า</h3></div><div className="p-6 space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อร้าน</label><input className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" value={settings.shop_name} onChange={e=>setSettings({...settings, shop_name: e.target.value})} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่</label><textarea className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500 h-24" value={settings.shop_address} onChange={e=>setSettings({...settings, shop_address: e.target.value})} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label><input className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" value={settings.shop_phone} onChange={e=>setSettings({...settings, shop_phone: e.target.value})} /></div></div></div>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6"><div className="p-6 border-b border-gray-100"><h3 className="font-bold text-lg text-gray-800">🧾 ตั้งค่าอื่นๆ</h3></div><div className="p-6 space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">VAT (%)</label><input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" value={settings.vat_rate} onChange={e=>setSettings({...settings, vat_rate: e.target.value})} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">ข้อความท้ายใบเสร็จ</label><input className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-orange-500" value={settings.receipt_footer} onChange={e=>setSettings({...settings, receipt_footer: e.target.value})} /></div></div></div>
                  <button onClick={handleSaveSettings} disabled={isSavingSettings} className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-orange-200 hover:bg-orange-500 transition-all">{isSavingSettings ? 'กำลังบันทึก...' : '💾 บันทึกการตั้งค่า'}</button>
              </div>
          )}
      </main>

      {showBillModal && currentBillTable && ( <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"><div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"><div className="bg-orange-600 p-6 text-white text-center"><h3 className="text-2xl font-bold">โต๊ะ {currentBillTable.table_number}</h3><p className="opacity-80 text-sm">สรุปยอดชำระเงิน</p></div><div className="p-6 max-h-[300px] overflow-y-auto bg-gray-50">{billItems.map((item, idx) => ( <div key={idx} className="flex justify-between py-2 border-b border-gray-100 last:border-0 text-sm text-gray-600"><span>{item.name} x{item.quantity}</span><span className="font-bold text-gray-800">{item.price}</span></div> ))}</div><div className="p-6 pt-0 bg-white border-t border-gray-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]"><div className="flex justify-between items-center py-4"><span className="text-gray-500">ยอดรวมทั้งสิ้น</span><span className="text-3xl font-black text-orange-600">฿{billTotal}</span></div><div className="mb-4"><input type="number" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className="w-full bg-gray-100 text-center text-2xl font-bold p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 text-gray-800" placeholder="รับเงินมา..." autoFocus /></div>{cashReceived && ( <div className="flex justify-between items-center mb-4 p-3 bg-green-50 rounded-xl text-green-700"><span className="font-bold">เงินทอน</span><span className="text-xl font-black">฿{parseFloat(cashReceived) - billTotal}</span></div> )}<div className="flex gap-2"><button onClick={() => setShowBillModal(false)} className="flex-1 py-3 rounded-xl text-gray-500 hover:bg-gray-100">ยกเลิก</button><button onClick={confirmPayment} disabled={!cashReceived || parseFloat(cashReceived) < billTotal} className={`flex-1 py-3 rounded-xl font-bold text-white shadow-lg ${!cashReceived || parseFloat(cashReceived) < billTotal ? 'bg-gray-300' : 'bg-green-600 hover:bg-green-500 shadow-green-200'}`}>ยืนยัน</button></div></div></div></div> )}
      <style jsx global>{` @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fade-in 0.3s ease-out; } `}</style>
    </div>
  );
}