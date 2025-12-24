"use client";
import { useEffect, useState, Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function OrderPageContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");
  
  const [menu, setMenu] = useState([]);
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // เพิ่มตัวแปรเช็คสิทธิ์ (แก้หน้าขาว)
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (!tableId) return;

    const fetchData = async () => {
      // 1. ดึงข้อมูลโต๊ะ
      const { data: tableData } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("id", tableId)
        .single();

      if (tableData) {
        setTable(tableData);

        // --- เริ่มระบบป้องกัน (ย้ายมาทำในนี้เพื่อกันหน้าขาว) ---
        const localKey = localStorage.getItem(`session_key_${tableId}`);
        
        if (tableData.status === "available") {
          // ถ้าโต๊ะปิด -> ล้างกุญแจ -> ห้ามเข้า
          localStorage.removeItem(`session_key_${tableId}`);
          setIsAuthorized(false);
        } 
        else if (tableData.session_key !== localKey) {
          // ถ้ากุญแจไม่ตรง (เพิ่งมาใหม่) -> รับกุญแจ -> ให้เข้า
          localStorage.setItem(`session_key_${tableId}`, tableData.session_key);
          setIsAuthorized(true);
        } 
        else {
          // ถ้ากุญแจตรง -> ให้เข้า
          setIsAuthorized(true);
        }
        // --- จบระบบป้องกัน ---
      }

      // 2. ดึงเมนู
      const { data: menuData } = await supabase
        .from("restaurant_menus")
        .select("*")
        .eq("is_available", true)
        .order("category");
      
      if (menuData) setMenu(menuData);
      setLoading(false);
    };

    fetchData();
  }, [tableId]);

  // UI: ถ้าไม่มีเลขโต๊ะ
  if (!tableId) return <div className="p-10 text-center">กรุณาสแกน QR Code ที่โต๊ะครับ</div>;

  // UI: กำลังโหลด
  if (loading) return <div className="p-10 text-center">กำลังโหลดเมนู... ⏳</div>;

  // UI: เช็คสิทธิ์ (ใช้ตัวแปร state แทนการเช็คสด)
  if (!table || table.status === 'available' || !isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-sm">
          <div className="text-5xl mb-4">⛔</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">โต๊ะยังไม่เปิดบริการ</h1>
          <p className="text-gray-600">
            กรุณาติดต่อพนักงานเพื่อเปิดโต๊ะก่อนสั่งอาหารนะครับ
          </p>
        </div>
      </div>
    );
  }

  // UI: หน้าเมนูอาหาร
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-800">
          🍽️ สั่งอาหาร - โต๊ะ {table.table_number}
        </h1>
      </div>

      <div className="p-4 gap-4 grid grid-cols-1 md:grid-cols-2">
        {menu.map((item) => (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm flex flex-row justify-between items-center">
            <div>
                <h3 className="font-bold text-lg">{item.name}</h3>
                <p className="text-gray-500 text-sm">{item.category}</p>
                <p className="text-orange-500 font-bold mt-1">{item.price} บาท</p>
            </div>
             {item.image_url && (
                <img src={item.image_url} alt={item.name} className="w-24 h-24 object-cover rounded-lg ml-4" />
             )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">กำลังโหลด...</div>}>
      <OrderPageContent />
    </Suspense>
  );
}