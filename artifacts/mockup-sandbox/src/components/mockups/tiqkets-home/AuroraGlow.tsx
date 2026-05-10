import React from "react";
import { 
  Search, 
  ScanLine, 
  CalendarPlus, 
  Clock, 
  History, 
  MapPin, 
  Coffee, 
  Scissors, 
  Landmark, 
  Stethoscope, 
  Building, 
  Home, 
  User, 
  ChevronRight,
  Sparkles
} from "lucide-react";

export default function AuroraGlow() {
  return (
    <div className="relative w-[390px] h-[844px] bg-[#0A0A0B] text-white overflow-hidden font-sans mx-auto shadow-2xl ring-1 ring-white/10 flex flex-col">
      {/* Background Aurora Effect */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-20%] w-[300px] h-[300px] bg-[#8F00FF] rounded-full mix-blend-screen filter blur-[100px] opacity-40 animate-pulse"></div>
        <div className="absolute top-[20%] left-[-20%] w-[250px] h-[250px] bg-[#D91E8A] rounded-full mix-blend-screen filter blur-[90px] opacity-40"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] bg-[#8F00FF] rounded-full mix-blend-screen filter blur-[120px] opacity-30"></div>
        <div className="absolute bottom-[30%] left-[10%] w-[200px] h-[200px] bg-[#D91E8A] rounded-full mix-blend-screen filter blur-[80px] opacity-20"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pb-24">
        {/* Header */}
        <header className="px-6 pt-14 pb-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-white/60 text-sm font-medium tracking-wider uppercase mb-1">Good evening</span>
            <h1 className="text-3xl font-bold tracking-tight">Aarav</h1>
          </div>
          <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-tr from-[#D91E8A] to-[#8F00FF]">
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center border border-black/50 overflow-hidden">
               <img src="https://i.pravatar.cc/150?u=aarav" alt="Profile" className="w-full h-full object-cover opacity-90" />
            </div>
          </div>
        </header>

        {/* Search */}
        <div className="px-6 mb-8">
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-[#D91E8A] to-[#8F00FF] rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative flex items-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 h-14">
              <Search className="w-5 h-5 text-white/40 mr-3" />
              <input 
                type="text" 
                placeholder="Search places, categories..." 
                className="bg-transparent border-none outline-none flex-1 text-white placeholder-white/40 text-base"
              />
            </div>
          </div>
        </div>

        {/* Active Queue Card */}
        <div className="px-6 mb-8">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#D91E8A] via-[#8F00FF] to-[#D91E8A] rounded-[28px] blur opacity-60 animate-pulse"></div>
            <div className="relative bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00FF94] shadow-[0_0_10px_#00FF94] animate-pulse"></div>
                  <span className="text-xs font-bold text-white/80 uppercase tracking-widest">Active Queue</span>
                </div>
                <span className="text-xs text-white/60 bg-white/5 px-2 py-1 rounded-md">Called ~7:48 PM</span>
              </div>
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Sundara Hair Lounge</h2>
                  <p className="text-white/60 text-sm">Premium Haircut</p>
                </div>
                <div className="bg-gradient-to-br from-[#D91E8A] to-[#8F00FF] text-white px-3 py-1 rounded-xl shadow-lg border border-white/20">
                  <span className="text-lg font-black tracking-wider">A-042</span>
                </div>
              </div>

              <div className="flex items-end justify-between mb-4">
                <div className="flex flex-col">
                  <span className="text-white/50 text-xs uppercase tracking-wider mb-1">Position</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black leading-none">#3</span>
                    <span className="text-white/50 text-sm font-medium">/ 11</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-white/50 text-xs uppercase tracking-wider mb-1">Est. Time</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black leading-none text-[#00FF94]">12</span>
                    <span className="text-[#00FF94]/70 text-sm font-medium">min</span>
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/10 rounded-full mb-5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#D91E8A] to-[#00FF94] w-[75%] rounded-full relative">
                  <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]"></div>
                </div>
              </div>

              <button className="w-full py-3.5 bg-white/10 hover:bg-white/20 transition backdrop-blur-md rounded-xl flex items-center justify-center gap-2 border border-white/10 group">
                <span className="font-semibold text-sm">View Ticket Details</span>
                <ChevronRight className="w-4 h-4 text-white/60 group-hover:text-white transition group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-6 mb-8">
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: ScanLine, label: "Scan QR" },
              { icon: CalendarPlus, label: "Book" },
              { icon: Sparkles, label: "Explore" },
              { icon: History, label: "History" },
            ].map((action, i) => (
              <div key={i} className="flex flex-col items-center gap-2 cursor-pointer group">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-md group-hover:bg-white/10 group-hover:border-white/20 transition-all shadow-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#D91E8A]/20 to-[#8F00FF]/20 opacity-0 group-hover:opacity-100 transition"></div>
                  <action.icon className="w-6 h-6 text-white/80 group-hover:text-white transition relative z-10" />
                </div>
                <span className="text-[11px] font-medium text-white/60 group-hover:text-white transition">{action.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Nearby */}
        <div className="px-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Nearby & Fast</h3>
            <button className="text-[13px] font-medium text-[#D91E8A] hover:text-[#ff38a7] transition">See all</button>
          </div>
          
          <div className="flex flex-col gap-3">
            {[
              { name: "Glow Spa & Salon", cat: "Salon", wait: "No wait", dist: "0.4 km", icon: Scissors, status: "open", timeColor: "text-[#00FF94]" },
              { name: "Café Mosaic", cat: "Cafe", wait: "4 min", dist: "0.2 km", icon: Coffee, status: "open", timeColor: "text-[#00FF94]" },
              { name: "HDFC Branch — Indiranagar", cat: "Bank", wait: "9 min", dist: "1.2 km", icon: Landmark, status: "open", timeColor: "text-white/80" },
              { name: "Apollo Skin Clinic", cat: "Clinic", wait: "18 min", dist: "2.1 km", icon: Stethoscope, status: "open", timeColor: "text-[#FFB800]" },
              { name: "Toast & Co. Brunch", cat: "Restaurant", wait: "24 min", dist: "0.8 km", icon: Coffee, status: "busy", timeColor: "text-[#FF3B30]" },
              { name: "Passport Seva Kendra", cat: "Government", wait: "32 min", dist: "4.5 km", icon: Building, status: "closed", timeColor: "text-white/40" },
            ].map((place, i) => (
              <div key={i} className={`flex items-center justify-between p-4 rounded-2xl backdrop-blur-md border border-white/5 transition active:scale-[0.98] cursor-pointer ${place.status === 'closed' ? 'bg-white/[0.02] opacity-60' : 'bg-white/[0.06] hover:bg-white/[0.08]'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${place.status === 'closed' ? 'bg-white/5' : 'bg-gradient-to-br from-white/10 to-white/5'} border border-white/10 shadow-inner`}>
                    <place.icon className="w-5 h-5 text-white/70" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm mb-0.5">{place.name}</h4>
                    <div className="flex items-center gap-2 text-[11px] text-white/50">
                      <span>{place.cat}</span>
                      <span className="w-1 h-1 rounded-full bg-white/20"></span>
                      <div className="flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />
                        <span>{place.dist}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  {place.status === 'closed' ? (
                    <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider bg-white/5 px-2 py-1 rounded-md">Closed</span>
                  ) : (
                    <>
                      <span className={`text-sm font-bold ${place.timeColor}`}>{place.wait}</span>
                      {place.status === 'busy' && <span className="text-[10px] text-[#FF3B30]/80 font-medium mt-0.5">Busy</span>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Bottom Nav */}
      <div className="absolute bottom-6 left-6 right-6 z-50">
        <div className="relative">
          <div className="absolute -inset-2 bg-[#8F00FF]/20 rounded-[24px] blur-xl"></div>
          <nav className="relative bg-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl h-16 flex items-center justify-around px-2 shadow-2xl">
            {[
              { icon: Home, label: "Home", active: true },
              { icon: Clock, label: "Bookings" },
              { icon: History, label: "History" },
              { icon: User, label: "Profile" },
            ].map((tab, i) => (
              <div key={i} className="flex flex-col items-center justify-center w-16 h-full cursor-pointer relative group">
                {tab.active && (
                  <div className="absolute top-0 w-8 h-1 bg-gradient-to-r from-[#D91E8A] to-[#8F00FF] rounded-b-full shadow-[0_0_8px_#D91E8A]"></div>
                )}
                <tab.icon className={`w-5 h-5 mb-1 ${tab.active ? 'text-white' : 'text-white/40 group-hover:text-white/70 transition'}`} />
                <span className={`text-[10px] font-medium ${tab.active ? 'text-white' : 'text-white/40 group-hover:text-white/70 transition'}`}>{tab.label}</span>
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Custom Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
