export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6 text-center font-sans">
      <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mb-6 shadow-sm">
        <span className="text-5xl">📷</span>
      </div>
      <h1 className="text-3xl font-black text-gray-800 mb-2">ยินดีต้อนรับครับ</h1>
      <p className="text-gray-500 mb-8 max-w-sm text-lg">
        เพื่อเริ่มสั่งอาหาร <br/>
        <span className="text-orange-600 font-bold">กรุณาสแกน QR Code ที่โต๊ะ</span><br/>
        เพื่อระบุเลขโต๊ะของคุณนะครับ
      </p>
      <div className="text-sm text-gray-400 border-t pt-4 w-full max-w-xs">
        Bella Cucina © 2025
      </div>
    </div>
  );
}