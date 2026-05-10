import React, { useState } from 'react';
import { 
  Search, 
  ScanLine, 
  CalendarDays, 
  MapPin, 
  Clock, 
  Compass, 
  User, 
  History,
  ChevronRight,
  MoreHorizontal
} from 'lucide-react';

export function VelvetEditorial() {
  return (
    <div className="w-[390px] h-[844px] bg-[#1A0E14] text-[#F9F6F0] relative overflow-hidden flex flex-col font-sans" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
      <style dangerouslySetInnerHTML={{__html: `
        .font-editorial { font-family: 'Playfair Display', serif; }
        .glass-panel { background: rgba(42, 26, 36, 0.4); backdrop-filter: blur(16px); border: 1px solid rgba(200, 164, 93, 0.15); }
        .text-gold { color: #C8A45D; }
        .bg-gold { background-color: #C8A45D; }
        .border-gold { border-color: #C8A45D; }
        
        /* Hide scrollbar for Chrome, Safari and Opera */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .no-scrollbar {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      `}} />

      {/* Main Scrollable Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        
        {/* Header */}
        <header className="px-6 pt-14 pb-4 flex justify-between items-center z-10 relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-[#C8A45D]/30 p-0.5">
              <img src="/__mockup/images/aarav-avatar.png" alt="Aarav" className="w-full h-full object-cover rounded-full" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#A89F9D] mb-0.5">Welcome Back</p>
              <h1 className="font-editorial text-xl italic tracking-wide">Aarav</h1>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full glass-panel flex items-center justify-center text-[#F9F6F0] hover:bg-[#C8A45D]/10 transition-colors">
            <Search className="w-4 h-4" />
          </button>
        </header>

        {/* Active Queue Editorial Hero */}
        <section className="px-6 mt-6 mb-10">
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-[10px] uppercase tracking-[0.15em] text-[#A89F9D]">Your Appointment</h2>
            <span className="text-[10px] uppercase tracking-wider text-gold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse"></span>
              Live
            </span>
          </div>
          
          <div className="relative w-full h-[380px] rounded-[24px] overflow-hidden group cursor-pointer shadow-2xl shadow-[#000000]/50">
            {/* Background Image */}
            <div className="absolute inset-0">
              <img 
                src="/__mockup/images/sundara-lounge.png" 
                alt="Sundara Hair Lounge" 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1A0E14] via-[#1A0E14]/70 to-transparent"></div>
              <div className="absolute inset-0 bg-gradient-to-b from-[#1A0E14]/30 to-transparent"></div>
            </div>

            {/* Content Overlay */}
            <div className="absolute inset-0 p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-gold" />
                  <span className="text-xs font-medium tracking-wide">~12 min wait</span>
                </div>
                <button className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div>
                <p className="text-gold text-xs uppercase tracking-[0.2em] mb-3">Premium Haircut</p>
                <h3 className="font-editorial text-4xl leading-none mb-5 font-medium">Sundara<br/>Hair Lounge</h3>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[#A89F9D]">Queue Progress</span>
                    <span className="text-[10px] tracking-wide text-gold">73%</span>
                  </div>
                  <div className="h-[3px] w-full rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-gold" style={{ width: '73%' }}></div>
                  </div>
                </div>

                <div className="flex items-end justify-between border-t border-white/10 pt-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-[#A89F9D] mb-1">Ticket Number</p>
                    <p className="font-editorial text-3xl text-white">A-042</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-[#A89F9D] mb-1">Position</p>
                    <p className="text-2xl font-light"><span className="text-gold">#3</span><span className="text-sm text-white/50">/11</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="px-6 mb-10">
          <div className="grid grid-cols-2 gap-3">
            <button className="glass-panel p-4 rounded-2xl flex flex-col gap-3 items-start hover:bg-[#2A1A24]/60 transition-colors">
              <div className="w-8 h-8 rounded-full border border-[#C8A45D]/30 flex items-center justify-center text-gold">
                <ScanLine className="w-4 h-4" />
              </div>
              <span className="text-sm tracking-wide">Scan QR</span>
            </button>
            <button className="glass-panel p-4 rounded-2xl flex flex-col gap-3 items-start hover:bg-[#2A1A24]/60 transition-colors">
              <div className="w-8 h-8 rounded-full border border-[#C8A45D]/30 flex items-center justify-center text-gold">
                <CalendarDays className="w-4 h-4" />
              </div>
              <span className="text-sm tracking-wide">Book Now</span>
            </button>
          </div>
        </section>

        {/* Nearby Suggestions */}
        <section className="px-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-editorial text-2xl italic">Nearby</h2>
            <button className="text-xs uppercase tracking-widest text-gold flex items-center gap-1">
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {[
              { name: "Café Mosaic", cat: "Cafe", wait: "4 min", dist: "0.2 km", status: "open" },
              { name: "Apollo Skin Clinic", cat: "Clinic", wait: "18 min", dist: "1.1 km", status: "open" },
              { name: "HDFC Branch", cat: "Bank", wait: "9 min", dist: "1.4 km", status: "open" },
              { name: "Toast & Co. Brunch", cat: "Restaurant", wait: "24 min", dist: "2.3 km", status: "busy" },
              { name: "Glow Spa & Salon", cat: "Salon", wait: "No wait", dist: "2.8 km", status: "open" },
            ].map((place, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-2xl glass-panel group cursor-pointer hover:bg-[#2A1A24]/80 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#1A0E14] border border-[#C8A45D]/20 flex items-center justify-center font-editorial text-lg text-gold">
                    {place.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-[15px] font-medium tracking-wide mb-1">{place.name}</h4>
                    <p className="text-xs text-[#A89F9D] flex items-center gap-2">
                      <span>{place.cat}</span>
                      <span className="w-0.5 h-0.5 rounded-full bg-[#A89F9D]"></span>
                      <span>{place.dist}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${place.status === 'busy' ? 'text-[#F9F6F0]' : 'text-gold'}`}>{place.wait}</p>
                  <p className="text-[10px] text-[#A89F9D] uppercase tracking-wider mt-1">{place.status === 'busy' ? 'Busy' : 'Open'}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Bottom Navigation */}
      <nav className="absolute bottom-0 w-full h-[88px] glass-panel border-t-0 flex justify-between items-center px-8 pb-6 pt-2 z-20"
           style={{ background: 'linear-gradient(to top, rgba(26, 14, 20, 0.95) 40%, rgba(26, 14, 20, 0.8))' }}>
        <button className="flex flex-col items-center gap-1.5 text-gold">
          <Compass className="w-6 h-6" strokeWidth={1.5} />
          <span className="text-[9px] uppercase tracking-widest font-medium">Explore</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-[#A89F9D] hover:text-[#F9F6F0] transition-colors">
          <CalendarDays className="w-6 h-6" strokeWidth={1.5} />
          <span className="text-[9px] uppercase tracking-widest">Bookings</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-[#A89F9D] hover:text-[#F9F6F0] transition-colors">
          <History className="w-6 h-6" strokeWidth={1.5} />
          <span className="text-[9px] uppercase tracking-widest">History</span>
        </button>
        <button className="flex flex-col items-center gap-1.5 text-[#A89F9D] hover:text-[#F9F6F0] transition-colors">
          <User className="w-6 h-6" strokeWidth={1.5} />
          <span className="text-[9px] uppercase tracking-widest">Profile</span>
        </button>
      </nav>
    </div>
  );
}
