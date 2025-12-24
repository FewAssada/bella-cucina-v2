"use client";
import { useEffect, useState, Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

// --- ส่วนป้องกัน 1: เช็ค Env Variable ก่อนสร้าง Client ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.error("❌ ไม่พบค่า Supabase URL หรือ Key ใน Environment Variables");
}

function OrderPageContent() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");

  const [menu, setMenu] = useState([]);
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [errorMessage, setErrorMessage] = useState(""); // เอาไว้โชว์ error บนหน้าจอ

  useEffect(() => {
    // ถ้าไม่มี Supabase ให้แจ้ง Error ทันที
    if (!supabase) {
      setErrorMessage("System Error: เชื่อมต่อฐานข้อมูลไม่ได้ (Missing ENV)");
      setLoading(false);
      return;
    }

    if (!tableId) return;

    const fetchData = async () => {
      try {
        // 1. ดึงข้อมูลโต๊ะ
        const { data: tableData, error: tableError } = await supabase
          .from("restaurant_tables")
          .select("*")
          .eq("id", tableId)
          .single();

        if (tableError) throw tableError;

        if (tableData) {
          setTable(tableData);

          // --- เริ่มระบบป้องกัน (ใส่ try-catch กันพัง) ---
          try {
            const localKey = localStorage.getItem(`session_key_${tableId}`);

            if (tableData.status === "available") {
              localStorage.removeItem(`session_key_${tableId}`);
              setIsAuthorized(false);
            } else if (tableData.session_key !== localKey) {
              localStorage.setItem(`session_key_${tableId}`, tableData.session_key);
              setIsAuthorized(true);
            } else {
              setIsAuthorized(true);
            }
          } catch (storageError) {
            console.error("Storage Error:", storageError);
            // ถ้าเช็ค localStorage ไม่ได้ ให้ยอมให้เข้า (กันลูกค้าสั่งไม่ได้)
            setIsAuthorized(true); 
          }
          // --- จบระบบป้องกัน ---
        }

        // 2. ดึงเมนูอาหาร
        const { data: menuData, error: menuError } = await supabase
          .from("restaurant_menus")
          .select("*")
          .eq("is_available", true)
          .order("category");

        if (menuError) throw menuError;

        if (menuData) setMenu(menuData);
      
      } catch (err) {
        console.error("Fetch Error:", err);
        setErrorMessage("เกิดข้อผิดพลาด: " + (err.message || "Unknown Error"));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tableId]);

  // --- ส่วนแสดงผล (UI) ---

  // 1. ถ้ามี Error ร้ายแรง ให้โชว์เลย
  if (errorMessage) {
    return (
      <div className="p-10 text-center text-red-500 bg-red-50 min-h-screen flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-2">⚠️ เกิดข้อผิดพลาด</h2>
        <p>{errorMessage}</p>
      </div>
    );
  }

  // 2. ถ้าไม่มีเลขโต๊ะ
  if (!tableId) return <div className="p-10 text-center text-xl">📷 กรุณาสแกน QR Code ที่โต๊ะครับ</div>;

  // 3. ถ้ากำลังโหลด
  if (loading) return <div className="p-10 text-center text-xl">⏳ กำลังโหลดเมนู...</div>;

  // 4. เช็คสิทธิ์ (ถ้าโต๊ะปิด หรือ ไม่ผ่าน)
  if (!table || table.status === 'available' || !isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-sm">
          <div className="text-5xl mb-4">⛔</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">โต๊ะยังไม่เปิดบริการ</h1>
          <p className="text-gray-600">กรุณาติดต่อพนักงานเพื่อเปิดโต๊ะก่อนนะครับ</p>
        </div>
      </div>
    );
  }

  // 5. แสดงหน้าเมนู (ผ่านฉลุย)
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">
          🍽️ โต๊ะ {table.table_number}
        </h1>
      </div>

      <div className="p-4 gap-4 grid grid-cols-1 md:grid-cols-2">
        {menu.map((item) => (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm flex flex-row justify-between items-center">
            <div className="flex-1 pr-4">
                <h3 className="font-bold text-lg text-gray-800">{item.name}</h3>
                <p className="text-gray-500 text-sm mb-1">{item.category}</p>
                <p className="text-orange-600 font-bold text-lg">{item.price} ฿</p>
            </div>
             {item.image_url ? (
                <img 
                  src={item.image_url} 
                  alt={item.name} 
                  className="w-24 h-24 object-cover rounded-lg shadow-sm"
                  onError={(e) => {e.target.style.display = 'none'}} // ถ้ารูปเสีย ให้ซ่อนไปเลย
                />
             ) : (
                <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center text-2xl">🍽️</div>
             )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">กำลังเตรียมข้อมูล...</div>}>
      <OrderPageContent />
    </Suspense>
  );
}