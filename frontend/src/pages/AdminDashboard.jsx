import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wrench,
  Shield,
  LogOut,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Minus,
  Settings,
  User,
  Phone,
  MapPin,
  Tag,
  Check,
  X,
  RefreshCw,
  Search,
  Info,
  FileText,
  Sliders,
  CheckCircle2,
  Edit2
} from 'lucide-react';

export default function AdminDashboard({ onLogout }) {
  // Active navigation tab: 'bookings' | 'schedule' | 'services'
  const [activeTab, setActiveTab] = useState('bookings');

  // Admin user information
  const [adminUser, setAdminUser] = useState({ username: 'admin@fajrmaintenance.ae' });

  // Bookings state
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsFilter, setBookingsFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'CONFIRMED' | 'REJECTED'
  const [bookingSearch, setBookingSearch] = useState('');

  // Approval / Rejection modal state
  const [selectedBookingForAction, setSelectedBookingForAction] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve' | 'reject'
  const [finalPriceInput, setFinalPriceInput] = useState('');
  const [ownerNotesInput, setOwnerNotesInput] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // Schedule state
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [dayFilter, setDayFilter] = useState('ALL');
  const [newSlotForm, setNewSlotForm] = useState({
    day_of_week: 'Monday',
    start_time: '09:00 AM',
    end_time: '11:00 AM',
    capacity: 2,
    is_active: true,
  });
  const [addingSlot, setAddingSlot] = useState(false);

  // Services & Business Settings state
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editingServiceData, setEditingServiceData] = useState({});
  const [savingServiceId, setSavingServiceId] = useState(null);

  const [businessSettings, setBusinessSettings] = useState({
    operating_hours: '',
    coverage_areas: '',
    policy_notes: '',
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Notification toast
  const [notification, setNotification] = useState(null);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleAuthError = useCallback(() => {
    localStorage.removeItem('admin_token');
    if (typeof onLogout === 'function') {
      onLogout();
    } else {
      if (window.history && window.history.pushState) {
        window.history.pushState({}, '', '/login');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } else {
        window.location.href = '/login';
      }
    }
  }, [onLogout]);

  const authFetch = useCallback(
    async (url, options = {}) => {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        handleAuthError();
        throw new Error('Not authenticated');
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      };

      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        handleAuthError();
        throw new Error('Session expired. Please log in again.');
      }

      return response;
    },
    [handleAuthError]
  );

  const fetchAdminProfile = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/me');
      if (res.ok) {
        const data = await res.json();
        setAdminUser(data);
      }
    } catch {
      // Fallback to default
    }
  }, [authFetch]);

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const res = await authFetch('/api/admin/bookings');
      if (res.ok) {
        const data = await res.json();
        setBookings(data);
      } else {
        showNotification('error', 'Failed to fetch bookings list');
      }
    } catch {
      // Handled by authFetch / showNotification
    } finally {
      setBookingsLoading(false);
    }
  }, [authFetch]);

  const fetchSchedule = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const res = await authFetch('/api/admin/schedule');
      if (res.ok) {
        const data = await res.json();
        setSlots(data);
      }
    } catch {
      // Handled
    } finally {
      setSlotsLoading(false);
    }
  }, [authFetch]);

  const fetchServicesAndSettings = useCallback(async () => {
    setServicesLoading(true);
    try {
      const [servicesRes, settingsRes] = await Promise.all([
        authFetch('/api/admin/services'),
        authFetch('/api/admin/settings'),
      ]);

      if (servicesRes.ok) {
        const servicesData = await servicesRes.json();
        setServices(servicesData);
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setBusinessSettings({
          operating_hours: settingsData.operating_hours || '',
          coverage_areas: settingsData.coverage_areas || '',
          policy_notes: settingsData.policy_notes || '',
        });
      }
    } catch {
      // Handled
    } finally {
      setServicesLoading(false);
    }
  }, [authFetch]);

  // Initial Data Load
  useEffect(() => {
    fetchAdminProfile();
    fetchBookings();
    fetchSchedule();
    fetchServicesAndSettings();
  }, [fetchAdminProfile, fetchBookings, fetchSchedule, fetchServicesAndSettings]);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => {
      const s = (b.status || '').toLowerCase();
      return s === 'pending' || s === 'pending_approval';
    }).length;
    const confirmed = bookings.filter((b) => {
      const s = (b.status || '').toLowerCase();
      return s === 'approved' || s === 'confirmed';
    }).length;
    const rejected = bookings.filter((b) => {
      const s = (b.status || '').toLowerCase();
      return s === 'rejected';
    }).length;

    return { total, pending, confirmed, rejected };
  }, [bookings]);

  // Filtered Bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const statusLower = (b.status || '').toLowerCase();
      let matchesFilter = true;
      if (bookingsFilter === 'PENDING') {
        matchesFilter = statusLower === 'pending' || statusLower === 'pending_approval';
      } else if (bookingsFilter === 'CONFIRMED') {
        matchesFilter = statusLower === 'approved' || statusLower === 'confirmed';
      } else if (bookingsFilter === 'REJECTED') {
        matchesFilter = statusLower === 'rejected';
      }

      if (!matchesFilter) return false;

      if (!bookingSearch.trim()) return true;

      const q = bookingSearch.toLowerCase();
      return (
        b.customer_name?.toLowerCase().includes(q) ||
        b.customer_phone?.toLowerCase().includes(q) ||
        b.reference_no?.toLowerCase().includes(q) ||
        b.customer_address?.toLowerCase().includes(q) ||
        b.service?.name?.toLowerCase().includes(q)
      );
    });
  }, [bookings, bookingsFilter, bookingSearch]);

  const openApproveModal = (booking) => {
    setSelectedBookingForAction(booking);
    setActionType('approve');
    setFinalPriceInput(booking.quoted_price_aed ? String(booking.quoted_price_aed) : '150');
    setOwnerNotesInput(booking.owner_notes || '');
  };

  const openRejectModal = (booking) => {
    setSelectedBookingForAction(booking);
    setActionType('reject');
    setOwnerNotesInput(booking.owner_notes || 'Outside capacity / service area');
  };

  const closeActionModal = () => {
    setSelectedBookingForAction(null);
    setActionType(null);
    setFinalPriceInput('');
    setOwnerNotesInput('');
  };

  const handleBookingActionSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!selectedBookingForAction) return;

    setActionSubmitting(true);
    const id = selectedBookingForAction.id;

    try {
      let endpoint = '';
      let payload = {};

      if (actionType === 'approve') {
        endpoint = `/api/admin/bookings/${id}/approve`;
        payload = {
          final_price_aed: parseFloat(finalPriceInput) || selectedBookingForAction.quoted_price_aed,
          owner_notes: ownerNotesInput.trim() || undefined,
        };
      } else {
        endpoint = `/api/admin/bookings/${id}/reject`;
        payload = {
          owner_notes: ownerNotesInput.trim() || 'Declined by owner',
        };
      }

      const res = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to ${actionType} booking`);
      }

      showNotification(
        'success',
        `Booking #${selectedBookingForAction.reference_no} ${actionType === 'approve' ? 'approved' : 'rejected'} successfully.`
      );
      closeActionModal();
      await fetchBookings();
      fetchSchedule();
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleCancelBooking = async (booking) => {
    if (!window.confirm(`Are you sure you want to cancel booking #${booking.reference_no}? This will release the technician slot capacity.`)) {
      return;
    }
    try {
      const res = await authFetch(`/api/admin/bookings/${booking.id}/cancel`, {
        method: 'POST'
      });
      if (!res.ok) {
        throw new Error('Failed to cancel booking');
      }
      showNotification('success', `Booking #${booking.reference_no} cancelled and technician slot released.`);
      await fetchBookings();
      fetchSchedule();
    } catch (err) {
      showNotification('error', err.message);
    }
  };

  const handleUpdateSlotCapacity = async (slot, delta) => {
    const newCapacity = Math.max(0, slot.capacity + delta);
    try {
      const res = await authFetch(`/api/admin/schedule/${slot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ capacity: newCapacity }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSlots((prev) => prev.map((s) => (s.id === slot.id ? updated : s)));
        showNotification(
          'success',
          `Updated capacity for ${slot.day_of_week} ${slot.start_time} to ${newCapacity}`
        );
      } else {
        showNotification('error', 'Failed to update slot capacity');
      }
    } catch (err) {
      showNotification('error', err.message);
    }
  };

  const handleToggleSlotActive = async (slot) => {
    const newActiveState = !slot.is_active;
    try {
      const res = await authFetch(`/api/admin/schedule/${slot.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: newActiveState }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSlots((prev) => prev.map((s) => (s.id === slot.id ? updated : s)));
        showNotification(
          'success',
          `Slot ${slot.day_of_week} ${slot.start_time} is now ${newActiveState ? 'Active' : 'Inactive'}`
        );
      } else {
        showNotification('error', 'Failed to toggle slot state');
      }
    } catch (err) {
      showNotification('error', err.message);
    }
  };

  const handleAddSlot = async (e) => {
    e.preventDefault();
    setAddingSlot(true);
    try {
      const res = await authFetch('/api/admin/schedule', {
        method: 'POST',
        body: JSON.stringify({
          day_of_week: newSlotForm.day_of_week,
          start_time: newSlotForm.start_time,
          end_time: newSlotForm.end_time,
          capacity: parseInt(newSlotForm.capacity, 10) || 1,
          is_active: newSlotForm.is_active,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to create slot');
      }

      showNotification('success', `Added new slot for ${newSlotForm.day_of_week}`);
      await fetchSchedule();
      setNewSlotForm({
        day_of_week: 'Monday',
        start_time: '09:00 AM',
        end_time: '11:00 AM',
        capacity: 2,
        is_active: true,
      });
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setAddingSlot(false);
    }
  };

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const filteredSlots = useMemo(() => {
    if (dayFilter === 'ALL') return slots;
    return slots.filter((s) => s.day_of_week.toLowerCase() === dayFilter.toLowerCase());
  }, [slots, dayFilter]);

  const startEditService = (service) => {
    setEditingServiceId(service.id);
    setEditingServiceData({
      name: service.name,
      price_aed: service.price_aed,
      description: service.description || '',
      is_active: service.is_active,
    });
  };

  const cancelEditService = () => {
    setEditingServiceId(null);
    setEditingServiceData({});
  };

  const handleSaveService = async (id) => {
    setSavingServiceId(id);
    try {
      const res = await authFetch(`/api/admin/services/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingServiceData.name,
          price_aed: parseFloat(editingServiceData.price_aed),
          description: editingServiceData.description,
          is_active: editingServiceData.is_active,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update service');
      }

      const updated = await res.json();
      setServices((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setEditingServiceId(null);
      showNotification('success', `Updated service "${updated.name}"`);
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setSavingServiceId(null);
    }
  };

  const handleToggleServiceActive = async (service) => {
    try {
      const res = await authFetch(`/api/admin/services/${service.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !service.is_active }),
      });
      if (res.ok) {
        const updated = await res.json();
        setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
        showNotification('success', `${service.name} is now ${!service.is_active ? 'Active' : 'Inactive'}`);
      }
    } catch (err) {
      showNotification('error', err.message);
    }
  };

  const handleSaveBusinessSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      const res = await authFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(businessSettings),
      });

      if (!res.ok) {
        throw new Error('Failed to update business settings');
      }

      const updated = await res.json();
      setBusinessSettings(updated);
      showNotification('success', 'Business settings successfully updated');
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLogoutClick = () => {
    handleAuthError();
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved' || s === 'confirmed') {
      return (
        <span className="badge-confirmed">
          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Confirmed
        </span>
      );
    }
    if (s === 'rejected') {
      return (
        <span className="badge-rejected">
          <XCircle className="w-3.5 h-3.5 mr-1" /> Rejected
        </span>
      );
    }
    if (s === 'cancelled') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          <XCircle className="w-3.5 h-3.5 mr-1 text-slate-400" /> Cancelled
        </span>
      );
    }
    return (
      <span className="badge-pending">
        <Clock className="w-3.5 h-3.5 mr-1" /> Pending Approval
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200/90 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: Branding */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center shadow-sm">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-none">
                    Al Fajr Maintenance
                  </h1>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                    <Shield className="w-3 h-3 mr-1" /> Admin Portal
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
                  Abu Dhabi Operations &amp; Booking Control
                </p>
              </div>
            </div>

            {/* Right: User indicator & Log out */}
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-700 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-medium">{adminUser.username}</span>
              </div>

              <button
                type="button"
                onClick={handleLogoutClick}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Log Out</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-1 sm:space-x-4 border-t border-slate-100 -mb-px overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('bookings')}
              className={`py-3.5 px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'bookings'
                  ? 'border-brand-600 text-brand-700 bg-brand-50/40 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              Approvals &amp; Bookings
              {metrics.pending > 0 && (
                <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-amber-500 text-white font-bold">
                  {metrics.pending}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('schedule')}
              className={`py-3.5 px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'schedule'
                  ? 'border-brand-600 text-brand-700 bg-brand-50/40 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Weekly Tech Schedule
            </button>

            <button
              onClick={() => setActiveTab('services')}
              className={`py-3.5 px-4 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === 'services'
                  ? 'border-brand-600 text-brand-700 bg-brand-50/40 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Services &amp; Pricing
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* ========================================================= */}
        {/* TAB 1: APPROVALS & BOOKINGS */}
        {/* ========================================================= */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card-surface p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Total Bookings
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-0.5">{metrics.total}</p>
                </div>
              </div>

              <div className="card-surface p-5 flex items-center gap-4 bg-gradient-to-br from-amber-50/50 to-white">
                <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                    Pending Approvals
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-2xl font-bold text-amber-900">{metrics.pending}</p>
                    {metrics.pending > 0 && (
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Requires Review
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="card-surface p-5 flex items-center gap-4 bg-gradient-to-br from-emerald-50/50 to-white">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                    Confirmed Visits
                  </p>
                  <p className="text-2xl font-bold text-emerald-900 mt-0.5">{metrics.confirmed}</p>
                </div>
              </div>
            </div>

            {/* Controls Bar: Filters & Search */}
            <div className="card-surface p-4 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
              {/* Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-400 mr-1 hidden sm:inline">
                  Status:
                </span>
                <button
                  type="button"
                  onClick={() => setBookingsFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    bookingsFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({metrics.total})
                </button>
                <button
                  type="button"
                  onClick={() => setBookingsFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    bookingsFilter === 'PENDING'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  Pending Approval ({metrics.pending})
                </button>
                <button
                  type="button"
                  onClick={() => setBookingsFilter('CONFIRMED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    bookingsFilter === 'CONFIRMED'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  Confirmed ({metrics.confirmed})
                </button>
                <button
                  type="button"
                  onClick={() => setBookingsFilter('REJECTED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    bookingsFilter === 'REJECTED'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                  }`}
                >
                  Rejected ({metrics.rejected})
                </button>
              </div>

              {/* Search & Refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={bookingSearch}
                    onChange={(e) => setBookingSearch(e.target.value)}
                    placeholder="Search customer, phone, ref..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {bookingSearch && (
                    <button
                      onClick={() => setBookingSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={fetchBookings}
                  disabled={bookingsLoading}
                  className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  title="Refresh Bookings"
                >
                  <RefreshCw className={`w-4 h-4 ${bookingsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Bookings List */}
            {bookingsLoading && bookings.length === 0 ? (
              <div className="card-surface p-12 text-center text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-600 mb-2" />
                <p className="text-sm font-medium">Loading bookings...</p>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="card-surface p-12 text-center text-slate-500">
                <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="text-base font-semibold text-slate-700">No bookings match the filter</p>
                <p className="text-xs text-slate-400 mt-1">
                  Try changing the filter or clearing the search query.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredBookings.map((b) => {
                  const isPending =
                    (b.status || '').toLowerCase() === 'pending' ||
                    (b.status || '').toLowerCase() === 'pending_approval';

                  return (
                    <div
                      key={b.id}
                      className={`card-surface p-5 sm:p-6 transition-all hover:shadow-md ${
                        isPending ? 'border-amber-300 bg-amber-50/10' : ''
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        {/* Left Info Column */}
                        <div className="space-y-3 flex-1">
                          {/* Header: Ref No & Status */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                              {b.reference_no}
                            </span>
                            {getStatusBadge(b.status)}

                            {b.discount_requested && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <Tag className="w-3 h-3 mr-1" /> Discount Requested
                              </span>
                            )}

                            <span className="text-xs text-slate-400 ml-auto lg:ml-2">
                              {new Date(b.created_at).toLocaleString([], {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                          </div>

                          {/* Customer Details Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs text-slate-700">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-900">{b.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                              <a
                                href={`tel:${b.customer_phone}`}
                                className="text-brand-600 hover:underline font-mono"
                              >
                                {b.customer_phone}
                              </a>
                            </div>
                            <div className="flex items-start gap-2 md:col-span-2">
                              <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <span className="text-slate-600 leading-snug">{b.customer_address}</span>
                            </div>
                          </div>

                          {/* Service & Slot Info */}
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center gap-4 text-xs">
                            <div className="flex items-center gap-2">
                              <Wrench className="w-4 h-4 text-brand-600" />
                              <span className="text-slate-500">Service:</span>
                              <span className="font-semibold text-slate-900">
                                {b.service?.name || 'General Maintenance'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-brand-600" />
                              <span className="text-slate-500">Requested Slot:</span>
                              <span className="font-semibold text-slate-900">
                                {b.slot
                                  ? `${b.slot.day_of_week} (${b.slot.start_time} - ${b.slot.end_time})`
                                  : b.preferred_time_text || 'Custom Request'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 ml-auto">
                              <span className="text-slate-500">Quoted Price:</span>
                              <span className="font-bold text-slate-900">
                                AED {b.quoted_price_aed ?? '0.00'}
                              </span>
                              {b.final_price_aed !== null && b.final_price_aed !== undefined && (
                                <>
                                  <span className="text-slate-400">→ Final:</span>
                                  <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    AED {b.final_price_aed}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Customer Discount Note */}
                          {b.discount_notes && (
                            <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2">
                              <Tag className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">Customer note / reason:</span>{' '}
                                {b.discount_notes}
                              </div>
                            </div>
                          )}

                          {/* Owner Notes if available */}
                          {b.owner_notes && (
                            <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-800 flex items-start gap-2">
                              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">Owner&apos;s Decision Note:</span>{' '}
                                {b.owner_notes}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right Action Column */}
                        <div className="flex flex-row lg:flex-col items-center justify-end gap-2 lg:min-w-[140px] pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                          {isPending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openApproveModal(b)}
                                className="flex-1 lg:w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-sm transition-all cursor-pointer"
                              >
                                <Check className="w-4 h-4" /> Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => openRejectModal(b)}
                                className="flex-1 lg:w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer"
                              >
                                <X className="w-4 h-4" /> Reject
                              </button>
                            </>
                          ) : (
                            <div className="flex flex-row lg:flex-col gap-2 w-full">
                              <button
                                type="button"
                                onClick={() => openApproveModal(b)}
                                className="flex-1 lg:w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" /> Edit Decision
                              </button>
                              {b.status !== 'cancelled' && b.status !== 'rejected' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelBooking(b)}
                                  className="flex-1 lg:w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" /> Cancel Visit
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: WEEKLY TECH SCHEDULE */}
        {/* ========================================================= */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            {/* Schedule Top Explainer Card */}
            <div className="card-surface p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-brand-50/50 to-white">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Weekly Technician Capacity</h2>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                  Manage weekly service windows across Monday to Saturday (9:00 AM – 6:00 PM).
                  Increase or decrease technician capacity on any slot, toggle slot availability, or
                  schedule new time windows.
                </p>
              </div>

              {/* Day filter pills */}
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setDayFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    dayFilter === 'ALL'
                      ? 'bg-brand-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  All Days
                </button>
                {daysOfWeek.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setDayFilter(day)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      dayFilter.toLowerCase() === day.toLowerCase()
                        ? 'bg-brand-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Slots Cards / Table */}
            <div className="card-surface overflow-hidden">
              <div className="p-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-600" />
                  Scheduled Slot Windows ({filteredSlots.length})
                </h3>
                <button
                  type="button"
                  onClick={fetchSchedule}
                  disabled={slotsLoading}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${slotsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {slotsLoading && slots.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-600 mb-2" />
                  <p className="text-sm font-medium">Loading weekly tech slots...</p>
                </div>
              ) : filteredSlots.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Calendar className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No slots configured for this day</p>
                  <p className="text-xs text-slate-400 mt-1">Use the form below to add a new slot window.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3.5 px-4">Day</th>
                        <th className="py-3.5 px-4">Time Window</th>
                        <th className="py-3.5 px-4">Booked / Total Capacity</th>
                        <th className="py-3.5 px-4 text-center">Adjust Capacity</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4 text-right">Toggle Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSlots.map((slot) => {
                        const isFull = slot.booked_count >= slot.capacity;
                        const available = Math.max(0, slot.capacity - slot.booked_count);

                        return (
                          <tr
                            key={slot.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              !slot.is_active ? 'opacity-60 bg-slate-50/40' : ''
                            }`}
                          >
                            <td className="py-4 px-4 font-bold text-slate-900">{slot.day_of_week}</td>
                            <td className="py-4 px-4">
                              <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                {slot.start_time} – {slot.end_time}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-sm">
                                  {slot.booked_count}
                                </span>
                                <span className="text-slate-400">/</span>
                                <span className="font-semibold text-slate-700">{slot.capacity} max</span>
                                {slot.is_active && (
                                  <span
                                    className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      isFull
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}
                                  >
                                    {isFull ? 'Full' : `${available} Available`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSlotCapacity(slot, -1)}
                                  disabled={slot.capacity <= 0}
                                  className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-white text-slate-700 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                                  title="Decrease Capacity"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-8 text-center font-bold text-slate-800">
                                  {slot.capacity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSlotCapacity(slot, 1)}
                                  className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                                  title="Increase Capacity"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-center">
                              {slot.is_active ? (
                                <span className="badge-confirmed">
                                  <Check className="w-3 h-3 mr-1" /> Active
                                </span>
                              ) : (
                                <span className="badge-rejected">
                                  <X className="w-3 h-3 mr-1" /> Disabled
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleSlotActive(slot)}
                                className={`px-3 py-1.5 rounded-xl font-semibold text-xs border transition-colors cursor-pointer ${
                                  slot.is_active
                                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                }`}
                              >
                                {slot.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Add New Slot Form Card */}
            <div className="card-surface p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-600" />
                Add New Weekly Slot Window
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Define standard tech availability for weekly customer bookings.
              </p>

              <form onSubmit={handleAddSlot} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Day of Week</label>
                  <select
                    value={newSlotForm.day_of_week}
                    onChange={(e) =>
                      setNewSlotForm((prev) => ({ ...prev, day_of_week: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {daysOfWeek.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Start Time</label>
                  <input
                    type="text"
                    value={newSlotForm.start_time}
                    onChange={(e) =>
                      setNewSlotForm((prev) => ({ ...prev, start_time: e.target.value }))
                    }
                    placeholder="09:00 AM"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">End Time</label>
                  <input
                    type="text"
                    value={newSlotForm.end_time}
                    onChange={(e) =>
                      setNewSlotForm((prev) => ({ ...prev, end_time: e.target.value }))
                    }
                    placeholder="11:00 AM"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Technician Capacity</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={newSlotForm.capacity}
                    onChange={(e) =>
                      setNewSlotForm((prev) => ({
                        ...prev,
                        capacity: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={addingSlot}
                    className="w-full btn-primary py-2 text-xs font-semibold gap-1.5 cursor-pointer"
                  >
                    {addingSlot ? (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>Add Slot</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: SERVICES & PRICING */}
        {/* ========================================================= */}
        {activeTab === 'services' && (
          <div className="space-y-6">
            {/* Services Table Card */}
            <div className="card-surface p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-brand-600" />
                    Services &amp; Standard Pricing
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure standard service offerings, default quoted rates (AED), and active catalog status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchServicesAndSettings}
                  disabled={servicesLoading}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-medium inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${servicesLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {servicesLoading && services.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-brand-600 mb-2" />
                  <p className="text-sm font-medium">Loading services...</p>
                </div>
              ) : (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Service Name</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Price (AED)</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {services.map((service) => {
                        const isEditing = editingServiceId === service.id;

                        if (isEditing) {
                          return (
                            <tr key={service.id} className="bg-brand-50/20">
                              <td className="py-3 px-4">
                                <input
                                  type="text"
                                  value={editingServiceData.name}
                                  onChange={(e) =>
                                    setEditingServiceData((prev) => ({
                                      ...prev,
                                      name: e.target.value,
                                    }))
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <input
                                  type="text"
                                  value={editingServiceData.description}
                                  onChange={(e) =>
                                    setEditingServiceData((prev) => ({
                                      ...prev,
                                      description: e.target.value,
                                    }))
                                  }
                                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1">
                                  <span className="font-semibold text-slate-400">AED</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editingServiceData.price_aed}
                                    onChange={(e) =>
                                      setEditingServiceData((prev) => ({
                                        ...prev,
                                        price_aed: e.target.value,
                                      }))
                                    }
                                    className="w-24 px-2.5 py-1.5 text-xs bg-white border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 font-bold"
                                  />
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editingServiceData.is_active}
                                    onChange={(e) =>
                                      setEditingServiceData((prev) => ({
                                        ...prev,
                                        is_active: e.target.checked,
                                      }))
                                    }
                                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                  />
                                  <span className="text-xs font-semibold text-slate-700">
                                    {editingServiceData.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </label>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveService(service.id)}
                                    disabled={savingServiceId === service.id}
                                    className="px-3 py-1 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditService}
                                    className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={service.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-900">{service.name}</td>
                            <td className="py-3.5 px-4 text-slate-600">{service.description || '—'}</td>
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-900 text-sm">
                                AED {Number(service.price_aed).toFixed(2)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {service.is_active ? (
                                <span className="badge-confirmed">
                                  <Check className="w-3 h-3 mr-1" /> Active
                                </span>
                              ) : (
                                <span className="badge-rejected">
                                  <X className="w-3 h-3 mr-1" /> Inactive
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => startEditService(service)}
                                  className="px-2.5 py-1 text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleServiceActive(service)}
                                  className={`px-2.5 py-1 text-xs rounded-lg font-medium border transition-colors cursor-pointer ${
                                    service.is_active
                                      ? 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'
                                      : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                  }`}
                                >
                                  {service.is_active ? 'Disable' : 'Enable'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Business Settings Editor Card */}
            <div className="card-surface p-6">
              <div className="pb-4 border-b border-slate-200 mb-5">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-brand-600" />
                  Business Operating Settings
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update customer-facing policy text, operating hours, and service coverage in Abu Dhabi.
                </p>
              </div>

              <form onSubmit={handleSaveBusinessSettings} className="space-y-4 max-w-3xl">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Operating Hours
                  </label>
                  <input
                    type="text"
                    value={businessSettings.operating_hours}
                    onChange={(e) =>
                      setBusinessSettings((prev) => ({
                        ...prev,
                        operating_hours: e.target.value,
                      }))
                    }
                    placeholder="Monday to Saturday, 9:00 AM – 6:00 PM"
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Displayed to customers in chat when checking business schedule.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Coverage Areas Text
                  </label>
                  <input
                    type="text"
                    value={businessSettings.coverage_areas}
                    onChange={(e) =>
                      setBusinessSettings((prev) => ({
                        ...prev,
                        coverage_areas: e.target.value,
                      }))
                    }
                    placeholder="Abu Dhabi city only"
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Defines geographic boundaries for service visits.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                    Owner Approval &amp; Policy Notes
                  </label>
                  <textarea
                    rows="3"
                    value={businessSettings.policy_notes}
                    onChange={(e) =>
                      setBusinessSettings((prev) => ({
                        ...prev,
                        policy_notes: e.target.value,
                      }))
                    }
                    placeholder="Discounts and appointments outside standard slots require owner approval"
                    className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Guidance for special discount requests and out-of-schedule visits.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={settingsSaving}
                    className="btn-primary py-2.5 px-5 text-xs font-semibold gap-2 cursor-pointer"
                  >
                    {settingsSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saving Settings...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save Business Settings</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* APPROVAL / REJECTION DIALOG MODAL */}
      {/* ========================================================= */}
      {selectedBookingForAction && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-surface max-w-lg w-full p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={closeActionModal}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  actionType === 'approve'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {actionType === 'approve' ? (
                  <CheckCircle className="w-6 h-6" />
                ) : (
                  <XCircle className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {actionType === 'approve' ? 'Approve Booking Visit' : 'Reject Booking Request'}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Ref #{selectedBookingForAction.reference_no} • {selectedBookingForAction.customer_name}
                </p>
              </div>
            </div>

            {/* Booking Summary Box */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-semibold text-slate-900">
                  {selectedBookingForAction.service?.name || 'General Maintenance'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Requested Time:</span>
                <span className="font-semibold text-slate-900">
                  {selectedBookingForAction.slot
                    ? `${selectedBookingForAction.slot.day_of_week} (${selectedBookingForAction.slot.start_time})`
                    : selectedBookingForAction.preferred_time_text || 'Standard'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Original Quoted:</span>
                <span className="font-bold text-slate-900">
                  AED {selectedBookingForAction.quoted_price_aed ?? '0.00'}
                </span>
              </div>
              {selectedBookingForAction.discount_notes && (
                <div className="pt-1 text-indigo-700 font-medium">
                  Note from customer: &ldquo;{selectedBookingForAction.discount_notes}&rdquo;
                </div>
              )}
            </div>

            <form onSubmit={handleBookingActionSubmit} className="space-y-4">
              {actionType === 'approve' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Final Price (AED)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      AED
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={finalPriceInput}
                      onChange={(e) => setFinalPriceInput(e.target.value)}
                      placeholder="e.g. 180"
                      className="w-full pl-12 pr-3.5 py-2.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    You can honor discounts or specify adjusted technician service charge.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  {actionType === 'approve'
                    ? 'Owner Note (Optional)'
                    : 'Rejection Reason / Owner Note'}
                </label>
                <textarea
                  rows="3"
                  value={ownerNotesInput}
                  onChange={(e) => setOwnerNotesInput(e.target.value)}
                  placeholder={
                    actionType === 'approve'
                      ? 'e.g. 10% discount approved. Technician Tariq assigned.'
                      : 'e.g. Requested time outside technician working hours or outside city coverage.'
                  }
                  required={actionType === 'reject'}
                  className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeActionModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={actionSubmitting}
                  className={`px-5 py-2 text-xs font-semibold text-white rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5 ${
                    actionType === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {actionSubmitting && (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>
                    {actionType === 'approve' ? 'Confirm & Approve' : 'Confirm & Reject'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
