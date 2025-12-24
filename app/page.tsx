"use client";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  // ฟังก์ชันสำหรับแอบเข้าครัว (หรือจะทำเป็นปุ่มเล็กๆ มุมขวาก็ได้)
  const handleStaffLogin = () => {
    const pin = prompt("รหัสพนักงาน:");
    if (pin === "45698") router.push("/kitchen"); // รหัสถูก ดีดไปหน้าครัว
    else if (pin) alert("รหัสผิดครับ!");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center font-sans">
      
      {/* Icon */}
      <div className="w-24 h-24 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-6 shadow-sm animate-bounce">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h-4v-4H6v-4h12v4zm-6-9l3-3 3 3M8 11h8" />
        </svg>
      </div>

      <h1 className="text-3xl font-black text-gray-800 mb-2">ยินดีต้อนรับสู่ Bella Cucina</h1>
      
      <p className="text-gray-500 mb-10 max-w-sm text-lg leading-relaxed">
        เพื่อเริ่มสั่งอาหาร <br/>
        <span className="text-orange-600 font-bold text-xl">กรุณาสแกน QR Code</span><br/>
        ที่ติดอยู่บนโต๊ะของคุณนะครับ
      </p>

      {/* ส่วน Footer แอบปุ่ม Staff ไว้ */}
      <div className="fixed bottom-6 text-sm text-gray-300 w-full text-center">
        <span 
            onClick={handleStaffLogin} 
            className="cursor-pointer hover:text-gray-500 transition-colors"
        >
            © 2025 Bella Cucina Management
        </span>
      </div>

    </div>
  );
}