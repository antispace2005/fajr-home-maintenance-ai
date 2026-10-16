import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  LogOut,
  RefreshCw,
  Plus,
  Minus,
  Edit2,
  Save,
  Check,
  X,
  Filter,
  User,
  Phone,
  MapPin,
  Tag,
  DollarSign
} from 'lucide-react';

const API_BASE = '/api';

export default function AdminDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('bookings'); // bookings, schedule, services
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [bookings, setBookings] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [services, setServices] = useState([]);
  const [settings, setSettings] = useState({});

  // Filter for bookings
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals / action states
  const [actionBooking, setActionBooking] = useState(null); // booking to approve/reject
  const [actionType, setActionType] = useState(null); // 'approve' | 'reject'
  const [actionPrice, setActionPrice] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // New slot form
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlot, setNewSlot] = useState({
    day_of_week: 'Tuesday',
    start_time: '10:00 AM',
    end_time: '12:00 PM',
    capacity: 1
  });

  // Edit service price
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editingPrice, setEditingPrice] = useState('');

  // Edit business settings
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    coverage_areas: '',
    operating_hours: '',
    policy_notes: ''
  });

  const getAuthHeader = () => {
    const token = localStorage.getItem('admin_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const checkAuthAndFetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeader();

      // Fetch bookings, schedule, services, settings in parallel
      const [resBookings, resSchedule, resServices, resSettings] = await Promise.all([
        fetch(`${API_BASE}/admin/bookings`, { headers }),
        fetch(`${API_BASE}/admin/schedule`, { headers }),
        fetch(`${API_BASE}/admin/services`, { headers }),
        fetch(`${API_BASE}/admin/settings`, { headers })
      ]);

      if (resBookings.status === 401 || resSchedule.status === 401) {
        localStorage.removeItem('admin_token');
        if (onLogout) onLogout();
        return;
      }

      const [dataBookings, dataSchedule, dataServices, dataSettings] = await Promise.all([
        resBookings.json(),
        resSchedule.json(),
        resServices.json(),
        resSettings.json()
      ]);

      setBookings(dataBookings);
      setSchedule(dataSchedule);
      setServices(dataServices);
      setSettings(dataSettings);
      setSettingsForm({
        coverage_areas: dataSettings.coverage_areas || '',
        operating_hours: dataSettings.operating_hours || '',
        policy_notes: dataSettings.policy_notes || ''
      });
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthAndFetchAll();
  }, []);

  const handleApproveBooking = async () => {
    if (!actionBooking) return;
    setSubmittingAction(true);
    try {
      const headers = getAuthHeader();
      const res = await fetch(`${API_BASE}/admin/bookings/${actionBooking.id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          final_price_aed: actionPrice ? parseFloat(actionPrice) : actionBooking.quoted_price_aed,
          owner_notes: actionNotes || 'Approved by owner.'
        })
      });
      if (!res.ok) throw new Error('Failed to approve booking');
      setActionBooking(null);
      await checkAuthAndFetchAll();
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRejectBooking = async () => {
    if (!actionBooking) return;
    setSubmittingAction(true);
    try {
      const headers = getAuthHeader();
      const res = await fetch(`${API_BASE}/admin/bookings/${actionBooking.id}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner_notes: actionNotes || 'Declined by owner.'
        })
      });
      if (!res.ok) throw new Error('Failed to reject booking');
      setActionBooking(null);
      await checkAuthAndFetchAll();
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAdjustSlotCapacity = async (slotId, currentCapacity, delta) => {
    const newCap = Math.max(0, currentCapacity + delta);
    try {
      const headers = getAuthHeader();
      const res = await fetch(`${API_BASE}/admin/schedule/${slotId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ capacity: newCap })
      });
      if (res.ok) {
        setSchedule(prev => prev.map(s => s.id === slotId ? { ...s, capacity: newCap } : s));
      }
    } catch (e) {
      console.error('Failed to adjust capacity', e);
    }
  };

  const handleToggleSlotActive = async (slotId, currentActive) => {
    try {
      const headers = getAuthHeader();
      const res = await fetch(`${API_BASE}/admin/schedule/${slotId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_active: !currentActive })
      });
      if (res.ok) {
        setSchedule(prev => prev.map(s => s.id === slotId ? { ...s, is_active: !currentActive } : s));
      }
    } catch (e) {
      console.error('Failed to toggle slot', e);
    }
  };

  const handleCreateSlot = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeader();
      const res = await fetch(`${API_BASE}/admin/schedule`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newSlot)
      });
      if (res.ok) {
        setShowAddSlot(false);
        await checkAuthAndFetchAll();
      }
    } catch (e) {
      alert('Failed to add slot');
    }
  };

  const handleSaveServicePrice = async (serviceId) => {
    try {
      const headers = getAuthHeader();
      const res = await fetch(`${API_BASE}/admin/services/${serviceId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ price_aed: parseFloat(editingPrice) })
      });
      if (res.ok) {
        setEditingServiceId(null);
        await checkAuthAndFetchAll();
      }
    } catch (e) {
      alert('Failed to update service price');
    }
  };

  const handleSaveSettings = async () => {
    try {
      const headers = getAuthHeader();
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(settingsForm)
      });
      if (res.ok) {
        setEditingSettings(false);
        await checkAuthAndFetchAll();
      }
    } catch (e) {
      alert('Failed to save settings');
    }
  };

  // Filter bookings
  const filteredBookings = bookings.filter(b => {
    if (statusFilter === 'ALL') return true;
    return b.status.toUpperCase() === statusFilter;
  });

  const pendingCount = bookings.filter(b => b.status.toUpperCase() === 'PENDING_APPROVAL').length;
  const confirmedCount = bookings.filter(b => b.status.toUpperCase() === 'CONFIRMED').length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center text-white shadow-xs">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  Al Fajr Home Maintenance
                </h1>
                <span className="bg-brand-800 text-brand-200 text-2xs px-2 py-0.5 rounded-full font-medium">
                  Owner Dashboard
                </span>
              </div>
              <p className="text-xs text-slate-400">Abu Dhabi Field Service Management</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="hidden sm:inline text-slate-400">
              Logged in as <strong className="text-slate-200">admin@fajrmaintenance.ae</strong>
            </span>
            <button
              onClick={checkAuthAndFetchAll}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('admin_token');
                if (onLogout) onLogout();
              }}
              className="flex items-center space-x-1.5 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800/80 px-3 py-1.5 rounded-lg transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 border-t border-slate-800 flex space-x-1">
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'bookings'
                ? 'border-brand-400 text-white bg-slate-800/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Bookings & Approvals</span>
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-slate-900 font-bold px-1.5 py-0.2 rounded-full text-2xs">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'schedule'
                ? 'border-brand-400 text-white bg-slate-800/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Weekly Technician Schedule</span>
          </button>

          <button
            onClick={() => setActiveTab('services')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'services'
                ? 'border-brand-400 text-white bg-slate-800/50'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Services & Settings</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* Metric Cards Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="card-surface p-4">
            <span className="text-xs text-slate-500 block">Total Requests</span>
            <span className="text-2xl font-bold text-slate-900">{bookings.length}</span>
          </div>
          <div className="card-surface p-4 border-amber-200 bg-amber-50/30">
            <span className="text-xs text-amber-700 block font-medium">Pending Approval</span>
            <span className="text-2xl font-bold text-amber-600">{pendingCount}</span>
          </div>
          <div className="card-surface p-4 border-emerald-200 bg-emerald-50/30">
            <span className="text-xs text-emerald-700 block font-medium">Confirmed Visits</span>
            <span className="text-2xl font-bold text-emerald-600">{confirmedCount}</span>
          </div>
          <div className="card-surface p-4">
            <span className="text-xs text-slate-500 block">Weekly Slots Active</span>
            <span className="text-2xl font-bold text-slate-900">
              {schedule.filter(s => s.is_active).length}
            </span>
          </div>
        </div>

        {/* TAB 1: BOOKINGS & APPROVALS */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-slate-400 mr-2 flex items-center">
                  <Filter className="w-3.5 h-3.5 mr-1" /> Filter:
                </span>
                {['ALL', 'PENDING_APPROVAL', 'CONFIRMED', 'REJECTED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition ${
                      statusFilter === st
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {st === 'ALL' ? 'All Requests' : st.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400">
                Showing {filteredBookings.length} bookings
              </span>
            </div>

            {/* Bookings List */}
            {filteredBookings.length === 0 ? (
              <div className="card-surface p-12 text-center text-slate-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No booking requests found for this filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBookings.map((b) => {
                  const isPending = b.status.toUpperCase() === 'PENDING_APPROVAL';
                  const isConfirmed = b.status.toUpperCase() === 'CONFIRMED';
                  const isRejected = b.status.toUpperCase() === 'REJECTED';

                  return (
                    <div
                      key={b.id}
                      className={`card-surface p-5 transition flex flex-col justify-between ${
                        isPending ? 'border-amber-300 ring-1 ring-amber-200 bg-amber-50/10' : ''
                      }`}
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                              {b.reference_no}
                            </span>
                            <span className="text-2xs text-slate-400 block mt-1">
                              Received {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                            </span>
                          </div>
                          <span
                            className={
                              isConfirmed
                                ? 'badge-confirmed'
                                : isPending
                                ? 'badge-pending'
                                : 'badge-rejected'
                            }
                          >
                            {b.status}
                          </span>
                        </div>

                        {/* Customer Details */}
                        <div className="space-y-1.5 text-xs text-slate-700 mb-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center text-sm font-semibold text-slate-900">
                            <User className="w-4 h-4 mr-1.5 text-slate-400" />
                            {b.customer_name}
                          </div>
                          <div className="flex items-center">
                            <Phone className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                            <a href={`tel:${b.customer_phone}`} className="text-brand-600 hover:underline">
                              {b.customer_phone}
                            </a>
                          </div>
                          <div className="flex items-start">
                            <MapPin className="w-3.5 h-3.5 mr-1.5 text-slate-400 mt-0.5" />
                            <span>{b.customer_address}</span>
                          </div>
                        </div>

                        {/* Booking Details */}
                        <div className="bg-slate-50 p-2.5 rounded-lg text-xs space-y-1 text-slate-700 mb-3">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Service:</span>
                            <span className="font-medium text-slate-900">
                              {b.service?.name || 'Home Maintenance'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Requested Time:</span>
                            <span className="font-medium text-slate-900">{b.preferred_time_text}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Quoted Price:</span>
                            <span className="font-bold text-slate-900">
                              AED {Number(b.quoted_price_aed || 0).toFixed(2)}
                            </span>
                          </div>
                          {b.final_price_aed && (
                            <div className="flex justify-between text-emerald-700 font-bold">
                              <span>Approved Final Price:</span>
                              <span>AED {Number(b.final_price_aed).toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        {/* Special Notes (Discounts / Out-of-schedule) */}
                        {(b.discount_requested || !b.slot_id) && (
                          <div className="mb-3 text-xs bg-amber-50 text-amber-800 p-2.5 rounded-lg border border-amber-200">
                            <strong>Special Request:</strong>
                            {b.discount_requested && (
                              <p className="mt-0.5">• Customer requested price discount: {b.discount_notes || 'Yes'}</p>
                            )}
                            {!b.slot_id && (
                              <p className="mt-0.5">• Custom time slot outside standard technician roster.</p>
                            )}
                          </div>
                        )}

                        {b.owner_notes && (
                          <div className="text-xs text-slate-500 italic bg-slate-100 p-2 rounded mb-3">
                            Owner Note: "{b.owner_notes}"
                          </div>
                        )}
                      </div>

                      {/* Action Buttons for Pending */}
                      {isPending && (
                        <div className="pt-3 border-t border-slate-100 flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setActionBooking(b);
                              setActionType('approve');
                              setActionPrice(b.quoted_price_aed);
                              setActionNotes('');
                            }}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center space-x-1 transition shadow-2xs"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Approve Visit</span>
                          </button>
                          <button
                            onClick={() => {
                              setActionBooking(b);
                              setActionType('reject');
                              setActionNotes('');
                            }}
                            className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center space-x-1 transition"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: WEEKLY TECHNICIAN SCHEDULE */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Weekly Technician Roster & Capacity Grid
                </h2>
                <p className="text-xs text-slate-500">
                  Adjust available technician count per time window. AI dynamically offers these slots.
                </p>
              </div>
              <button
                onClick={() => setShowAddSlot(true)}
                className="btn-primary text-xs py-2 px-3 flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Slot Window</span>
              </button>
            </div>

            {/* Schedule Cards / Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {schedule.map((slot) => {
                const remaining = slot.capacity - slot.booked_count;
                const isFull = remaining <= 0;

                return (
                  <div
                    key={slot.id}
                    className={`card-surface p-4 flex flex-col justify-between ${
                      !slot.is_active ? 'opacity-60 bg-slate-100' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-slate-900">
                          {slot.day_of_week}
                        </span>
                        <span
                          className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                            !slot.is_active
                              ? 'bg-slate-200 text-slate-600'
                              : isFull
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {!slot.is_active ? 'Inactive' : isFull ? 'Full' : `${remaining} Free`}
                        </span>
                      </div>

                      <div className="flex items-center text-xs text-slate-600 mb-3">
                        <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />
                        <span>{slot.start_time} - {slot.end_time}</span>
                      </div>

                      {/* Capacity Control Bar */}
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 mb-3">
                        <div className="flex justify-between items-center text-xs mb-2">
                          <span className="text-slate-500">Technician Capacity:</span>
                          <span className="font-bold text-slate-900">{slot.capacity} Techs</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">Booked Visits:</span>
                          <span className="font-medium text-slate-700">{slot.booked_count}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Adjust Buttons */}
                    <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleAdjustSlotCapacity(slot.id, slot.capacity, -1)}
                        className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                        title="Decrease Capacity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleAdjustSlotCapacity(slot.id, slot.capacity, 1)}
                        className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                        title="Increase Capacity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleSlotActive(slot.id, slot.is_active)}
                        className={`flex-1 text-2xs py-1.5 px-2 rounded-md font-medium transition ${
                          slot.is_active
                            ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {slot.is_active ? 'Disable Slot' : 'Enable Slot'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: SERVICES & SETTINGS */}
        {activeTab === 'services' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Services Management Card */}
            <div className="card-surface p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-1">Service Catalog & Pricing</h2>
              <p className="text-xs text-slate-500 mb-4">
                Update prices in AED. The AI assistant immediately offers these live rates.
              </p>

              <div className="space-y-3">
                {services.map((svc) => (
                  <div
                    key={svc.id}
                    className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-sm text-slate-900 block">{svc.name}</span>
                      <span className="text-xs text-slate-500">{svc.description}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {editingServiceId === svc.id ? (
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            value={editingPrice}
                            onChange={(e) => setEditingPrice(e.target.value)}
                            className="w-20 text-xs px-2 py-1 rounded border border-brand-500 outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveServicePrice(svc.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingServiceId(null)}
                            className="p-1 text-slate-400 hover:bg-slate-200 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-slate-900">
                            AED {Number(svc.price_aed).toFixed(0)}
                          </span>
                          <button
                            onClick={() => {
                              setEditingServiceId(svc.id);
                              setEditingPrice(svc.price_aed);
                            }}
                            className="p-1 text-slate-400 hover:text-brand-600 hover:bg-white rounded transition"
                            title="Edit Price"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Business Settings & Rules Card */}
            <div className="card-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Operating Policies</h2>
                  <p className="text-xs text-slate-500">Coverage and hours fed directly to Gemini prompt.</p>
                </div>
                {!editingSettings && (
                  <button
                    onClick={() => setEditingSettings(true)}
                    className="text-xs text-brand-600 hover:underline flex items-center space-x-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {editingSettings ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-2xs font-semibold text-slate-500 uppercase block mb-1">
                      Coverage Areas
                    </label>
                    <input
                      type="text"
                      value={settingsForm.coverage_areas}
                      onChange={(e) => setSettingsForm({ ...settingsForm, coverage_areas: e.target.value })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-2xs font-semibold text-slate-500 uppercase block mb-1">
                      Operating Hours
                    </label>
                    <input
                      type="text"
                      value={settingsForm.operating_hours}
                      onChange={(e) => setSettingsForm({ ...settingsForm, operating_hours: e.target.value })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-2xs font-semibold text-slate-500 uppercase block mb-1">
                      Approval Policy Note
                    </label>
                    <textarea
                      rows={2}
                      value={settingsForm.policy_notes}
                      onChange={(e) => setSettingsForm({ ...settingsForm, policy_notes: e.target.value })}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="flex space-x-2 pt-2">
                    <button onClick={handleSaveSettings} className="btn-primary text-xs py-1.5 px-3">
                      Save Policies
                    </button>
                    <button onClick={() => setEditingSettings(false)} className="btn-secondary text-xs py-1.5 px-3">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-slate-500 block text-2xs uppercase">Coverage Area:</span>
                    <span className="font-medium text-slate-800">{settings.coverage_areas || 'Abu Dhabi city only'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-slate-500 block text-2xs uppercase">Opening Hours:</span>
                    <span className="font-medium text-slate-800">{settings.operating_hours || 'Monday to Saturday, 9 AM – 6 PM'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-slate-500 block text-2xs uppercase">Approval Policy:</span>
                    <span className="font-medium text-slate-800">{settings.policy_notes || 'Discounts and off-slot visits require owner approval.'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Approval / Rejection Action Modal */}
      {actionBooking && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="card-surface max-w-md w-full p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {actionType === 'approve' ? 'Approve Booking Request' : 'Decline Booking Request'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Booking Ref: <strong>{actionBooking.reference_no}</strong> • Customer: {actionBooking.customer_name}
            </p>

            {actionType === 'approve' ? (
              <div className="space-y-3 text-xs mb-5">
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    Final Price in AED:
                  </label>
                  <input
                    type="number"
                    value={actionPrice}
                    onChange={(e) => setActionPrice(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    Owner Note to Customer (Optional):
                  </label>
                  <input
                    type="text"
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="e.g. Special 10% discount approved"
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs mb-5">
                <div>
                  <label className="text-slate-600 font-medium block mb-1">
                    Reason for Declining:
                  </label>
                  <textarea
                    rows={3}
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="e.g. No technicians available for Thursday 4 PM. Please choose Wednesday 2 PM."
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setActionBooking(null)}
                className="btn-secondary text-xs py-2 px-3.5"
                disabled={submittingAction}
              >
                Cancel
              </button>
              <button
                onClick={actionType === 'approve' ? handleApproveBooking : handleRejectBooking}
                disabled={submittingAction}
                className={`text-xs py-2 px-4 rounded-xl font-medium text-white transition ${
                  actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {submittingAction ? 'Processing...' : actionType === 'approve' ? 'Confirm Approval' : 'Decline Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Slot Modal */}
      {showAddSlot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <form onSubmit={handleCreateSlot} className="card-surface max-w-sm w-full p-5 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Add New Standard Slot</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-600 font-medium block mb-1">Day of Week</label>
                <select
                  value={newSlot.day_of_week}
                  onChange={(e) => setNewSlot({ ...newSlot, day_of_week: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-300 outline-none"
                >
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 font-medium block mb-1">Start Time</label>
                  <input
                    type="text"
                    value={newSlot.start_time}
                    onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value })}
                    placeholder="10:00 AM"
                    className="w-full p-2 rounded-lg border border-slate-300 outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-600 font-medium block mb-1">End Time</label>
                  <input
                    type="text"
                    value={newSlot.end_time}
                    onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value })}
                    placeholder="12:00 PM"
                    className="w-full p-2 rounded-lg border border-slate-300 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-600 font-medium block mb-1">Available Tech Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newSlot.capacity}
                  onChange={(e) => setNewSlot({ ...newSlot, capacity: parseInt(e.target.value) || 1 })}
                  className="w-full p-2 rounded-lg border border-slate-300 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddSlot(false)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary text-xs py-1.5 px-3">
                Create Slot
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
