'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Users, Plus, X, ChevronRight, Loader2,
  LogOut, ShieldCheck, Trash2, UserX, Clock, Calendar, AlertCircle
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getPayload, logout, isAuthenticated, getRole } from '@/lib/auth';

/* ─────────────────────────── Types ─────────────────────────── */
interface Course {
  id: string; title: string; capacity: number; filledSeats: number;
  credits: number; startTime: string; endTime: string;
  daysOfWeek: number[]; registrationStart: string | null; registrationEnd: string | null;
  createdAt: string;
}

interface Student {
  id: string; name: string; email: string; role: string;
  registrationId?: string; waitlistId?: string; position?: number;
}

interface CoursesResponse  { success: boolean; data: Course[]; meta: { total: number } }
interface StudentsResponse { success: boolean; data: { enrolled: Student[]; waitlisted: Student[] } }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toUTCString().slice(17, 22);
}

/* ─────────────────────────── Component ─────────────────────────── */
export default function AdminDashboard() {
  const router = useRouter();
  const payload = getPayload();

  const [courses, setCourses]         = useState<Course[]>([]);
  const [loadingCourses, setLCourses] = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [manageCourse, setManage]     = useState<Course | null>(null);
  const [students, setStudents]       = useState<{ enrolled: Student[]; waitlisted: Student[] } | null>(null);
  const [loadingStudents, setLS]      = useState(false);
  const [dropping, setDropping]       = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated() || getRole() !== 'ADMIN') {
      router.replace('/login');
    }
  }, [router]);

  const fetchCourses = useCallback(async () => {
    setLCourses(true);
    try {
      const res = await apiRequest<CoursesResponse>('/api/admin/courses');
      setCourses(res.data);
    } finally {
      setLCourses(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const openManage = async (course: Course) => {
    setManage(course);
    setLS(true);
    setStudents(null);
    try {
      const res = await apiRequest<StudentsResponse>(`/api/admin/courses/${course.id}/students`);
      setStudents(res.data);
    } finally {
      setLS(false);
    }
  };

  const forceDrop = async (courseId: string, targetUserId: string) => {
    setDropping(targetUserId);
    try {
      await apiRequest('/api/admin/force-drop', 'POST', { courseId, targetUserId });
      // Refresh student list
      const res = await apiRequest<StudentsResponse>(`/api/admin/courses/${courseId}/students`);
      setStudents(res.data);
      fetchCourses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Force-drop failed.');
    } finally {
      setDropping(null);
    }
  };

  const deleteCourse = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await apiRequest(`/api/admin/courses/${id}`, 'DELETE');
      fetchCourses();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const totalStudents = courses.reduce((s, c) => s + c.filledSeats, 0);

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl glass glow-violet flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Admin Command Center</h1>
            <p className="text-xs text-slate-500">Welcome, {payload?.userId?.slice(0, 8)}…</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white glass px-4 py-2 rounded-xl transition-colors"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Courses',  value: courses.length, icon: BookOpen, color: 'text-cyan-400',    glow: 'glow-cyan' },
          { label: 'Total Enrolled', value: totalStudents,  icon: Users,    color: 'text-emerald-400', glow: 'glow-emerald' },
          { label: 'Avg Capacity',   value: courses.length
              ? `${Math.round((totalStudents / courses.reduce((s, c) => s + c.capacity, 1)) * 100)}%`
              : '—',
            icon: ChevronRight, color: 'text-violet-400', glow: 'glow-violet' },
        ].map(stat => (
          <motion.div
            key={stat.label}
            whileHover={{ scale: 1.02, y: -2 }}
            className={`glass rounded-2xl p-5 ${stat.glow}`}
          >
            <stat.icon className={`w-5 h-5 ${stat.color} mb-3`} />
            <div className="text-3xl font-bold text-white">{stat.value}</div>
            <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Add Course Button ── */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-white">All Courses</h2>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-900 font-semibold text-sm px-5 py-2.5 rounded-xl glow-cyan"
        >
          <Plus className="w-4 h-4" /> Add Course
        </motion.button>
      </div>

      {/* ── Course Grid ── */}
      {loadingCourses ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((course, i) => {
            const pct = Math.min(100, Math.round((course.filledSeats / course.capacity) * 100));
            const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ scale: 1.02, y: -3 }}
                className="glass rounded-2xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-white text-sm leading-tight flex-1 mr-2">{course.title}</h3>
                  <button
                    onClick={() => deleteCourse(course.id, course.title)}
                    className="text-slate-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(course.startTime)}–{formatTime(course.endTime)}</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{course.daysOfWeek.map(d => DAYS[d]).join(', ')}</span>
                </div>

                <div className="flex gap-2 text-xs">
                  <span className="glass px-2 py-1 rounded-lg text-cyan-400">{course.credits} credits</span>
                  <span className="glass px-2 py-1 rounded-lg text-slate-300">{course.filledSeats}/{course.capacity} seats</span>
                </div>

                {/* Seat fill bar */}
                <div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Occupancy</span><span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: i * 0.04 + 0.3, duration: 0.6 }}
                      className={`h-full rounded-full ${barColor}`}
                    />
                  </div>
                </div>

                <button
                  onClick={() => openManage(course)}
                  className="mt-1 flex items-center justify-center gap-2 glass hover:bg-white/8 text-slate-300 text-xs font-medium py-2 rounded-xl transition-colors"
                >
                  <Users className="w-3.5 h-3.5" /> Manage Students
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Add Course Modal ── */}
      <AnimatePresence>
        {showModal && <CourseModal onClose={() => setShowModal(false)} onSuccess={() => { setShowModal(false); fetchCourses(); }} />}
      </AnimatePresence>

      {/* ── Student Roster Slide-over ── */}
      <AnimatePresence>
        {manageCourse && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end"
            onClick={() => setManage(null)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md glass border-l border-white/10 h-full overflow-y-auto p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-bold text-white">{manageCourse.title}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Student Roster</p>
                </div>
                <button onClick={() => setManage(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loadingStudents ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /></div>
              ) : students ? (
                <>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Enrolled ({students.enrolled.length})
                  </p>
                  {students.enrolled.length === 0 ? (
                    <p className="text-sm text-slate-500 mb-4">No enrolled students.</p>
                  ) : (
                    <div className="space-y-2 mb-6">
                      {students.enrolled.map(s => (
                        <div key={s.id} className="flex items-center justify-between glass rounded-xl px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-white">{s.name}</p>
                            <p className="text-xs text-slate-400">{s.email}</p>
                          </div>
                          <button
                            onClick={() => forceDrop(manageCourse.id, s.id)}
                            disabled={dropping === s.id}
                            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 glass px-3 py-1.5 rounded-lg glow-red transition-colors disabled:opacity-50"
                          >
                            {dropping === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                            Force Drop
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Waitlisted ({students.waitlisted.length})
                  </p>
                  {students.waitlisted.length === 0 ? (
                    <p className="text-sm text-slate-500">No waitlisted students.</p>
                  ) : (
                    <div className="space-y-2">
                      {students.waitlisted.map(s => (
                        <div key={s.id} className="flex items-center justify-between glass rounded-xl px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-white">{s.name}</p>
                            <p className="text-xs text-slate-400">Position #{s.position}</p>
                          </div>
                          <span className="text-xs text-amber-400 glass px-2 py-1 rounded-lg">Waitlisted</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── Course Creation Modal ─────────────── */
function CourseModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    title: '', capacity: '', credits: '', startTime: '09:00',
    endTime: '10:30', daysOfWeek: [] as number[],
    registrationStart: '', registrationEnd: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const toggleDay = (d: number) =>
    setForm(f => ({ ...f, daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter(x => x !== d) : [...f.daysOfWeek, d] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRequest('/api/admin/courses', 'POST', {
        title:    form.title,
        capacity: parseInt(form.capacity),
        credits:  parseInt(form.credits),
        startTime: form.startTime,
        endTime:   form.endTime,
        daysOfWeek: form.daysOfWeek,
        registrationStart: form.registrationStart || undefined,
        registrationEnd:   form.registrationEnd   || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create course.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 24 }}
        onClick={e => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-lg glow-cyan"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-white text-lg">Create New Course</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <input
            placeholder="Course Title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required className="input-cyber w-full rounded-xl px-4 py-3 text-sm"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              type="number" placeholder="Capacity" min="1"
              value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
              required className="input-cyber w-full rounded-xl px-4 py-3 text-sm"
            />
            <input
              type="number" placeholder="Credits" min="1" max="6"
              value={form.credits}
              onChange={e => setForm(f => ({ ...f, credits: e.target.value }))}
              required className="input-cyber w-full rounded-xl px-4 py-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Start Time</label>
              <input
                type="time" value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="input-cyber w-full rounded-xl px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">End Time</label>
              <input
                type="time" value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className="input-cyber w-full rounded-xl px-4 py-3 text-sm"
              />
            </div>
          </div>

          {/* Days of Week */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Days of Week</label>
            <div className="flex gap-2 flex-wrap">
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <button
                  key={i} type="button"
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all ${
                    form.daysOfWeek.includes(i)
                      ? 'bg-cyan-500 text-slate-900 glow-cyan'
                      : 'glass text-slate-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Registration Start</label>
              <input
                type="datetime-local"
                value={form.registrationStart}
                onChange={e => setForm(f => ({ ...f, registrationStart: e.target.value }))}
                className="input-cyber w-full rounded-xl px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Registration End</label>
              <input
                type="datetime-local"
                value={form.registrationEnd}
                onChange={e => setForm(f => ({ ...f, registrationEnd: e.target.value }))}
                className="input-cyber w-full rounded-xl px-4 py-3 text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            disabled={loading || form.daysOfWeek.length === 0}
            className="w-full bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-900 font-semibold text-sm py-3 rounded-xl glow-cyan disabled:opacity-50"
          >
            {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Creating…</span> : 'Create Course'}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>
  );
}
