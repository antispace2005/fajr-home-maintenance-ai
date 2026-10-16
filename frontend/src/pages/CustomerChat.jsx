import React, { useState, useEffect, useRef } from 'react';
import { 
  Wrench, 
  Send, 
  Clock, 
  MapPin, 
  Calendar, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Bookmark,
  ChevronRight,
  Info
} from 'lucide-react';

const API_BASE = '/api';

function FormattedText({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={i} className="leading-relaxed">
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return <strong key={j} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>;
              }
              if (p.startsWith('`') && p.endsWith('`')) {
                return <code key={j} className="px-1.5 py-0.5 rounded bg-slate-200/80 text-brand-800 text-xs font-mono font-medium">{p.slice(1, -1)}</code>;
              }
              return p;
            })}
          </p>
        );
      })}
    </div>
  );
}

export default function CustomerChat() {
  const [messages, setMessages] = useState([]);
  const [businessInfo, setBusinessInfo] = useState(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionState, setSessionState] = useState({
    customer_name: null,
    customer_phone: null,
    customer_address: null,
    service_name: null,
    preferred_time: null,
    discount_requested: false,
    status: 'COLLECTING',
    conversation_history: []
  });
  const [savedRefs, setSavedRefs] = useState([]);
  const [selectedRefStatus, setSelectedRefStatus] = useState(null);
  const [checkingRef, setCheckingRef] = useState(false);

  const messagesEndRef = useRef(null);

  // Fetch dynamic business info and load stored reference numbers on mount
  useEffect(() => {
    async function loadDynamicInitialData() {
      let storedRefs = [];
      try {
        const stored = localStorage.getItem('fajr_booking_refs');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            storedRefs = parsed;
            setSavedRefs(parsed);
          }
        }
      } catch (e) {
        console.error('Error reading localStorage refs:', e);
      }

      try {
        const res = await fetch(`${API_BASE}/public/info`);
        if (res.ok) {
          const info = await res.json();
          setBusinessInfo(info);

          // Build dynamic service bullets
          const serviceLines = (info.services || [])
            .map((s) => `• **${s.name}**: AED ${Number(s.price_aed).toFixed(0)}`)
            .join('\n');

          // Build dynamic slots text
          const slotLines = (info.available_slots || [])
            .map((sl) => `${sl.day_of_week} at ${sl.start_time}`)
            .join(' or ');

          const slotsDisplay = slotLines ? slotLines : 'Currently by owner approval';

          // Dynamic action buttons from database services
          const buttons = (info.services || []).map(
            (s) => `Book ${s.name} (AED ${Number(s.price_aed).toFixed(0)})`
          );
          buttons.push('Check Available Slots');

          // If returning customer with stored ref, offer to check status
          let returningNote = '';
          if (storedRefs.length > 0) {
            returningNote = `\n\n📌 *Welcome back! You have an existing booking reference **${storedRefs[0]}**.*`;
            buttons.unshift(`Check Status of ${storedRefs[0]}`);
          }

          setMessages([
            {
              role: 'assistant',
              content: `👋 **Welcome to ${info.company_name}!**\n\nI can help you check services, view technician availability, and book a visit in **${info.coverage_areas || 'Abu Dhabi'}**.\n\n${serviceLines}\n• **Open Standard Slots**: ${slotsDisplay}\n\nHow can we help your home today?${returningNote}`,
              actionButtons: buttons
            }
          ]);
          return;
        }
      } catch (err) {
        console.error('Failed to fetch public info:', err);
      }

      // Fallback greeting if network error
      setMessages([
        {
          role: 'assistant',
          content: `👋 **Welcome to Home Maintenance Assistant!**\n\nI am here to help answer questions and book technician visits in Abu Dhabi.\n\nHow can I help you today?`,
          actionButtons: ['Book a Visit', 'Check Available Slots']
        }
      ]);
    }

    loadDynamicInitialData();
  }, []);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const saveRefNumber = (ref) => {
    if (!ref) return;
    setSavedRefs((prev) => {
      const updated = Array.from(new Set([ref, ...prev]));
      localStorage.setItem('fajr_booking_refs', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSendMessage = async (textToSend) => {
    const message = (textToSend || inputText).trim();
    if (!message || loading) return;

    // Append user message immediately
    const userMsgObj = { role: 'user', content: message };
    setMessages((prev) => [...prev, userMsgObj]);
    setInputText('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          session_state: sessionState
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();

      // If reference number was returned, store it in localStorage
      if (data.reference_no) {
        saveRefNumber(data.reference_no);
      }

      // Update session state
      if (data.session_state) {
        setSessionState(data.session_state);
      }

      // Append assistant message
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply,
          actionButtons: data.action_buttons || [],
          summaryCard: data.summary_card,
          referenceNo: data.reference_no,
          status: data.status
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ I apologize, we encountered a technical issue connecting to our booking service. Please try again.`,
          actionButtons: ['Retry', 'Check Available Slots']
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const checkSavedRefStatus = async (ref) => {
    setCheckingRef(true);
    setSelectedRefStatus(null);
    try {
      const res = await fetch(`${API_BASE}/public/bookings/status?ref=${encodeURIComponent(ref)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedRefStatus(data);
      } else {
        setSelectedRefStatus({ not_found: true, ref });
      }
    } catch (e) {
      setSelectedRefStatus({ error: true });
    } finally {
      setCheckingRef(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Al Fajr Home Maintenance
              </h1>
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <span className="flex items-center text-emerald-700 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  AI Booking Assistant
                </span>
                <span>•</span>
                <span className="flex items-center text-slate-600">
                  <MapPin className="w-3 h-3 mr-0.5 text-slate-400" />
                  Abu Dhabi City Only
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="hidden sm:flex items-center space-x-1.5 text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full border border-slate-200 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Mon - Sat: 9 AM – 6 PM</span>
            </div>

            {savedRefs.length > 0 && (
              <div className="relative group">
                <button 
                  onClick={() => checkSavedRefStatus(savedRefs[0])}
                  className="flex items-center space-x-1.5 text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 px-3 py-1.5 rounded-full font-medium transition"
                  title="Check existing booking status"
                >
                  <Bookmark className="w-3.5 h-3.5 text-brand-600" />
                  <span>My Booking ({savedRefs[0]})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Reference Status Modal / Drawer if clicked */}
      {selectedRefStatus && (
        <div className="bg-brand-900 text-white px-4 py-3 shadow-md animate-fadeIn">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Info className="w-5 h-5 text-brand-300 flex-shrink-0" />
              {selectedRefStatus.not_found ? (
                <span className="text-sm">Reference <strong>{selectedRefStatus.ref}</strong> not found in database.</span>
              ) : selectedRefStatus.error ? (
                <span className="text-sm">Could not fetch booking status. Please try again.</span>
              ) : (
                <div className="text-sm">
                  <strong>Booking {selectedRefStatus.reference_no}</strong>: {selectedRefStatus.service_name} • Status:{' '}
                  <span className={`font-bold px-2 py-0.5 rounded text-xs ml-1 ${
                    selectedRefStatus.status === 'CONFIRMED' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-900'
                  }`}>
                    {selectedRefStatus.status}
                  </span>
                  {selectedRefStatus.owner_notes && (
                    <span className="ml-2 text-brand-200 italic">({selectedRefStatus.owner_notes})</span>
                  )}
                </div>
              )}
            </div>
            <button 
              onClick={() => setSelectedRefStatus(null)}
              className="text-xs text-brand-200 hover:text-white px-2 py-1 rounded bg-brand-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        <div className="flex-1 card-surface p-4 sm:p-6 flex flex-col justify-between overflow-hidden shadow-sm">
          
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
            {messages.map((msg, idx) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div 
                  key={idx} 
                  className={`flex items-start space-x-3 ${isAssistant ? 'justify-start' : 'justify-end'}`}
                >
                  {isAssistant && (
                    <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white flex-shrink-0 mt-1 shadow-xs">
                      <Wrench className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isAssistant 
                      ? 'bg-slate-100 text-slate-800 border border-slate-200/80 rounded-tl-sm' 
                      : 'bg-brand-600 text-white rounded-tr-sm shadow-xs'
                  }`}>
                    {/* Render message body with formatted markdown */}
                    <FormattedText text={msg.content} />

                    {/* Pre-Booking Summary Card if present */}
                    {msg.summaryCard && (
                      <div className="mt-3.5 pt-3 border-t border-slate-200 bg-white p-3.5 rounded-xl border shadow-2xs text-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-xs uppercase tracking-wider text-slate-500">
                            Requested Visit Summary
                          </span>
                          <span className={msg.summaryCard.requires_approval ? 'badge-pending' : 'badge-confirmed'}>
                            {msg.summaryCard.requires_approval ? 'Requires Approval' : 'Standard Available'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500 block">Service:</span>
                            <span className="font-medium text-slate-800">{msg.summaryCard.service}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Price:</span>
                            <span className="font-bold text-slate-900">AED {Number(msg.summaryCard.price_aed).toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Date & Time:</span>
                            <span className="font-medium text-slate-800">{msg.summaryCard.time}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Customer:</span>
                            <span className="font-medium text-slate-800">{msg.summaryCard.customer_name}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-slate-600 pt-1.5 border-t border-slate-100">
                          <span className="text-slate-500 block">Location:</span>
                          <span>{msg.summaryCard.customer_address}</span>
                        </div>
                      </div>
                    )}

                    {/* Action Chips attached to message */}
                    {msg.actionButtons && msg.actionButtons.length > 0 && idx === messages.length - 1 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex flex-wrap gap-1.5">
                        {msg.actionButtons.map((btnLabel, bIdx) => (
                          <button
                            key={bIdx}
                            onClick={() => handleSendMessage(btnLabel)}
                            disabled={loading}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center space-x-1 ${
                              btnLabel.toLowerCase().includes('confirm')
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                : btnLabel.toLowerCase().includes('cancel')
                                ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                : 'bg-white hover:bg-brand-50 text-brand-700 border border-brand-200'
                            }`}
                          >
                            <span>{btnLabel}</span>
                            <ChevronRight className="w-3 h-3 opacity-60" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center space-x-2 text-slate-400 text-xs italic pl-11">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600" />
                <span>Assistant is evaluating availability and rules...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Starter Suggestions */}
          {messages.length <= 2 && (
            <div className="mb-3 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-slate-400 mr-1 flex items-center">
                <Info className="w-3 h-3 mr-1" /> Quick questions:
              </span>
              {[
                "What are your working hours?",
                "Do you cover outside Abu Dhabi?",
                "Book AC servicing for Tuesday 10 AM",
                "Can I book plumbing for Wednesday at 2 PM?"
              ].map((query, qIdx) => (
                <button
                  key={qIdx}
                  onClick={() => handleSendMessage(query)}
                  disabled={loading}
                  className="text-xs bg-slate-100 hover:bg-brand-50 text-slate-700 hover:text-brand-700 border border-slate-200 px-2.5 py-1 rounded-md transition"
                >
                  {query}
                </button>
              ))}
            </div>
          )}

          {/* Chat Input Bar */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question, request a service, or provide your booking details..."
                disabled={loading}
                className="flex-1 bg-slate-50 hover:bg-white focus:bg-white text-slate-800 placeholder-slate-400 text-sm px-4 py-2.5 rounded-xl border border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none transition"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={loading || !inputText.trim()}
                className="btn-primary px-4 py-2.5 flex items-center space-x-1.5 shadow-xs"
              >
                <span>Send</span>
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between text-2xs text-slate-400 mt-2 px-1">
              <span>Abu Dhabi City Service Area • Certified Technicians</span>
              <span>Slots: Tue 10 AM | Wed 2 PM (Others require approval)</span>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
