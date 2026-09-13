import React from 'react';
import { Search, MapPin, Clock, ScanLine, Calendar, LayoutGrid, History, Home, Ticket, User, ChevronRight, Star, MoreHorizontal } from 'lucide-react';
import './LiquidMercury.css';

export function LiquidMercury() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-black p-4">
      <div className="w-[390px] h-[844px] lm-container relative rounded-[44px] shadow-[0_0_0_8px_#111] overflow-hidden flex flex-col">
        
        {/* Background glows */}
        <div className="absolute top-[-10%] left-[-20%] w-[80%] h-[40%] bg-[#8A2BE2] opacity-20 blur-[100px] pointer-events-none rounded-full" />
        <div className="absolute top-[20%] right-[-20%] w-[60%] h-[50%] bg-[#00F0FF] opacity-10 blur-[100px] pointer-events-none rounded-full" />

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto lm-hide-scrollbar pb-[100px]">
          
          {/* Header */}
          <header className="px-6 pt-14 pb-4 flex justify-between items-center relative z-10">
            <div className="flex flex-col">
              <span className="text-[13px] font-medium tracking-wide" style={{ color: 'var(--lm-muted)' }}>Good evening,</span>
              <h1 className="text-2xl font-semibold lm-gradient-text tracking-tight mt-0.5">Aarav</h1>
            </div>
            <button className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-[#8A2BE2]/20 to-[#00F0FF]/20" />
              <User className="w-5 h-5 text-white relative z-10" />
            </button>
          </header>

          {/* Search */}
          <div className="px-6 mb-8 relative z-10">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--lm-muted)' }} />
              <input 
                type="text" 
                placeholder="Search places, services..." 
                className="w-full h-12 rounded-2xl pl-12 pr-4 lm-search-input text-[15px] transition-all"
              />
            </div>
          </div>

          {/* Active Queue Wallet Pass */}
          <div className="px-6 mb-8 relative">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-white/60">Active Ticket</h2>
            </div>
            
            <div className="relative">
              {/* Stacked Shadow Card */}
              <div className="absolute inset-0 lm-pass-shadow rounded-[28px] z-0" />
              
              {/* Main Card */}
              <div className="lm-wallet-pass rounded-[28px] p-6 w-full cursor-pointer z-10 relative group">
                <div className="lm-wallet-content">
                  {/* Top row */}
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-white tracking-tight mb-1">Sundara Hair Lounge</h3>
                      <p className="text-sm text-white/60">Premium Haircut</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-xl px-3 py-1.5 border border-white/10 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] lm-pulse" />
                      <span className="text-xs font-semibold text-[#00F0FF]">Live</span>
                    </div>
                  </div>

                  {/* Middle Data */}
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-white/50 mb-1">Ticket</p>
                      <p className="text-4xl font-light tracking-tighter text-white">A-042</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-white/50 mb-1">Position</p>
                      <p className="text-2xl font-medium text-white">#3 <span className="text-white/40 text-lg">of 11</span></p>
                    </div>
                  </div>

                  {/* Progress & Time */}
                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2 font-medium">
                      <span className="text-white/80">Est. wait: <span className="text-[#00F0FF] font-semibold">~12 min</span></span>
                      <span className="text-white/50 text-xs">Called at 7:48 PM</span>
                    </div>
                    <div className="h-1.5 w-full lm-progress-bar rounded-full">
                      <div className="h-full lm-progress-fill rounded-full" style={{ width: '75%' }} />
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-white/20 to-transparent mb-5" />

                  {/* Bottom Action */}
                  <div className="flex items-center justify-center text-sm font-medium text-white/90 group-hover:text-white transition-colors">
                    View Queue Details
                    <ChevronRight className="w-4 h-4 ml-1 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="px-6 mb-10">
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: ScanLine, label: 'Scan QR' },
                { icon: Calendar, label: 'Book' },
                { icon: LayoutGrid, label: 'Browse' },
                { icon: History, label: 'History' },
              ].map((action, i) => (
                <button key={i} className="flex flex-col items-center gap-2 group">
                  <div className="w-[60px] h-[60px] rounded-[20px] lm-action-btn flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <action.icon className="w-6 h-6 text-white/80" />
                  </div>
                  <span className="text-[11px] font-medium text-white/60 tracking-wide">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nearby Section */}
          <div className="px-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white tracking-tight">Nearby & Shortest Wait</h2>
              <button className="text-xs font-semibold text-[#00F0FF] hover:text-white transition-colors">See all</button>
            </div>

            <div className="flex flex-col gap-3">
              {[
                { name: 'Café Mosaic', cat: 'Cafe', wait: '4 min', status: 'live', dist: '0.2 mi' },
                { name: 'Apollo Skin Clinic', cat: 'Clinic', wait: '18 min', status: 'live', dist: '1.1 mi' },
                { name: 'HDFC Branch — Indiranagar', cat: 'Bank', wait: '9 min', status: 'live', dist: '1.5 mi' },
                { name: 'Toast & Co. Brunch', cat: 'Restaurant', wait: '24 min', status: 'busy', dist: '2.0 mi' },
                { name: 'Glow Spa & Salon', cat: 'Salon', wait: 'No wait', status: 'live', dist: '2.3 mi' },
                { name: 'Passport Seva Kendra', cat: 'Government', wait: '32 min', status: 'closed', dist: '4.5 mi' },
              ].map((place, i) => (
                <div key={i} className="lm-nearby-card rounded-[20px] p-4 flex items-center gap-4 cursor-pointer relative overflow-hidden">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex flex-shrink-0 items-center justify-center font-semibold text-lg text-white">
                    {place.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-[15px] font-semibold text-white truncate pr-2">{place.name}</h3>
                      <div className="text-xs font-medium text-white/40 flex-shrink-0">{place.dist}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-white/60">{place.cat}</span>
                      <span className="w-1 h-1 rounded-full bg-white/20" />
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-white/40" />
                        <span className={`text-[13px] font-medium ${place.status === 'closed' ? 'text-red-400' : place.wait === 'No wait' ? 'text-green-400' : 'text-white/80'}`}>
                          {place.status === 'closed' ? 'Closed' : place.wait}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
        </div>

        {/* Floating Bottom Nav */}
        <div className="absolute bottom-6 left-6 right-6">
          <div className="lm-glass h-[72px] rounded-full flex items-center justify-between px-6">
            <button className="flex flex-col items-center gap-1 lm-nav-item active">
              <Home className="w-6 h-6" />
              <span className="text-[10px] font-medium">Home</span>
            </button>
            <button className="flex flex-col items-center gap-1 lm-nav-item">
              <Ticket className="w-6 h-6" />
              <span className="text-[10px] font-medium">Bookings</span>
            </button>
            <button className="flex flex-col items-center gap-1 lm-nav-item">
              <History className="w-6 h-6" />
              <span className="text-[10px] font-medium">History</span>
            </button>
            <button className="flex flex-col items-center gap-1 lm-nav-item">
              <User className="w-6 h-6" />
              <span className="text-[10px] font-medium">Profile</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default LiquidMercury;