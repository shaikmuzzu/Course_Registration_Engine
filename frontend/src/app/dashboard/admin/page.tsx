'use client';

import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, BookOpen, Users, LogOut, X, Trash2, Settings, ChevronDown, ChevronUp, GraduationCap
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { getSession, removeToken, redirectToLogin } from '@/lib/auth';

// --- Types ------------------------------------------------------------------
interface Student { id: string; name: string; email: string }
interface Course {
  id: string; title: string; capacity: number; filledSeats: number; credits: number;
  startTime: string; endTime: string; daysOfWeek: number[];
  registrationStart: string | null; registrationEnd: string | null;
  registrations: { user: Student }[];
  waitlists: { position: number; user: Student }[];
}

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// --- Component ---------------------------------------------------------------
export default function AdminDashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Course creation form
  const [form, setForm] = useState({
    title: '', capacity: '', credits: '', startTime: '09:00:00', endTime: '10:30:00',
    daysOfWeek: [] as string[], registrationStart: '', registrationEnd: ''
  });
  const [creating, setCreating] = useState(false);

  // Auth guard
  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== 'ADMIN') {
      removeToken();
      redirectToLogin();
      return;
    }
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const res = await api<Course[]>('/api/admin/courses');
      setCourses(res.data || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { removeToken(); redirectToLogin(); }
      setError(err instanceof Error ? err.message : 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api('/api/admin/courses', {
        method: 'POST',
        body: {
          title: form.title,
          capacity: Number(form.capacity),
          credits: Number(form.credits),
          startTime: form.startTime,
          endTime: form.endTime,
          daysOfWeek: form.daysOfWeek,
          registrationStart: form.registrationStart || null,
          registrationEnd: form.registrationEnd || null,
        }
      });
      setShowForm(false);
      setForm({ title: '', capacity: '', credits: '', startTime: '09:00:00', endTime: '10:30:00', daysOfWeek: [], registrationStart: '', registrationEnd: '' });
      fetchCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create course');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this course?')) return;
    try {
      await api(`/api/admin/courses/${id}`, { method: 'DELETE' });
      fetchCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleForceDrop = async (userId: string, courseId: string) => {
    if (!confirm('Force-drop this student?')) return;
    try {
      await api('/api/admin/drop', { method: 'POST', body: { userId, courseId } });
      fetchCourses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Force-drop failed');
    }
  };

  const toggleDay = (day: string) => {
    setForm(f => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter(d => d !== day)
        : [...f.daysOfWeek, day]
    }));
  };

  const handleLogout = () => { removeToken(); redirectToLogin(); };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <GraduationCap className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Command Center</h1>
              <p className="text-xs text-slate-500">Manage courses, students, and system settings</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-400 hover:bg-white/10 transition-colors">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-cyan-400" />
              <div>
                <p className="text-xs text-slate-500">Total Courses</p>
                <p className="text-2xl font-bold text-white">{courses.length}</p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-xs text-slate-500">Total Enrolled</p>
                <p className="text-2xl font-bold text-white">
                  {courses.reduce((s, c) => s + c.registrations.length, 0)}
                </p>
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-5">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-violet-400" />
              <div>
                <p className="text-xs text-slate-500">Seats Available</p>
                <p className="text-2xl font-bold text-white">
                  {courses.reduce((s, c) => s + (c.capacity - c.filledSeats), 0)}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Create Button */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Courses</h2>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowForm(!showForm)}
            className="btn-pulse flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
          >
            <Plus className="h-4 w-4" /> New Course
          </motion.button>
        </div>

        {/* Create Course Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <form onSubmit={handleCreate} className="glass-strong rounded-xl p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold text-white">Create New Course</h3>
                  <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Title</label>
                    <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Capacity</label>
                    <input required type="number" min="1" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Credits</label>
                    <input required type="number" min="1" value={form.credits} onChange={e => setForm(f => ({ ...f, credits: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Start Time</label>
                    <input required value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">End Time</label>
                    <input required value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Days of Week</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DAY_NAMES.map(d => (
                        <button key={d} type="button" onClick={() => toggleDay(d)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            form.daysOfWeek.includes(d)
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-white/5 text-slate-500 border border-white/10 hover:text-slate-300'
                          }`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Registration Start</label>
                    <input type="datetime-local" value={form.registrationStart}
                      onChange={e => setForm(f => ({ ...f, registrationStart: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Registration End</label>
                    <input type="datetime-local" value={form.registrationEnd}
                      onChange={e => setForm(f => ({ ...f, registrationEnd: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                  </div>
                </div>
                <motion.button type="submit" disabled={creating} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="mt-4 rounded-lg bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Course'}
                </motion.button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Course Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course, i) => (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.02 }}
              className="glass group rounded-xl p-5 transition-all hover:border-cyan-500/20"
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="font-semibold text-white leading-tight">{course.title}</h3>
                <button onClick={() => handleDelete(course.id)} className="text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-white/5 px-2 py-1.5">
                  <span className="text-slate-500">Credits:</span>{' '}
                  <span className="text-emerald-400 font-medium">{course.credits}</span>
                </div>
                <div className="rounded-md bg-white/5 px-2 py-1.5">
                  <span className="text-slate-500">Seats:</span>{' '}
                  <span className="text-cyan-400 font-medium">{course.filledSeats}/{course.capacity}</span>
                </div>
                <div className="rounded-md bg-white/5 px-2 py-1.5">
                  <span className="text-slate-500">Time:</span>{' '}
                  <span className="text-slate-300">{course.startTime.slice(11, 16)} - {course.endTime.slice(11, 16)}</span>
                </div>
                <div className="rounded-md bg-white/5 px-2 py-1.5">
                  <span className="text-slate-500">Days:</span>{' '}
                  <span className="text-slate-300">{course.daysOfWeek.map(d => DAY_NAMES[d]).join(', ')}</span>
                </div>
              </div>

              {/* Capacity bar */}
              <div className="mb-3">
                <div className="h-1.5 w-full rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full transition-all ${course.filledSeats >= course.capacity ? 'bg-red-500' : 'bg-cyan-500'}`}
                    style={{ width: `${Math.min((course.filledSeats / course.capacity) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Expand: enrolled students */}
              <button
                onClick={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
                className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <span>{course.registrations.length} enrolled, {course.waitlists.length} waitlisted</span>
                {expandedCourse === course.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              <AnimatePresence>
                {expandedCourse === course.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 space-y-1 overflow-hidden"
                  >
                    {course.registrations.length === 0 && (
                      <p className="text-xs text-slate-600 py-2">No students enrolled</p>
                    )}
                    {course.registrations.map((reg, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-white">{reg.user.name}</p>
                          <p className="text-[10px] text-slate-500">{reg.user.email}</p>
                        </div>
                        <button onClick={() => handleForceDrop(reg.user.id, course.id)}
                          className="rounded-md bg-red-500/10 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/20 transition-colors">
                          Drop
                        </button>
                      </div>
                    ))}
                    {course.waitlists.length > 0 && (
                      <>
                        <p className="pt-2 text-[10px] uppercase tracking-wider text-violet-400">Waitlist</p>
                        {course.waitlists.map((w, idx) => (
                          <div key={idx} className="flex items-center gap-2 rounded-md bg-violet-500/5 px-3 py-1.5">
                            <span className="text-[10px] text-violet-400">#{w.position}</span>
                            <span className="text-xs text-slate-400">{w.user.name}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {courses.length === 0 && (
          <div className="glass rounded-xl py-16 text-center">
            <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-slate-500">No courses yet. Create your first course above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
