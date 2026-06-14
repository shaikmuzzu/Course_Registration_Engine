'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, Clock, LogOut, Zap, AlertCircle, CheckCircle, GraduationCap, CalendarDays
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { getSession, removeToken, redirectToLogin } from '@/lib/auth';

// --- Types ------------------------------------------------------------------
interface Course {
  id: string; title: string; capacity: number; filledSeats: number; credits: number;
  startTime: string; endTime: string; daysOfWeek: number[];
  registrationStart: string | null; registrationEnd: string | null;
  prerequisites: { prerequisiteId: string }[];
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function StudentDashboard() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolled, setEnrolled] = useState<Course[]>([]);
  const [totalCredits, setTotalCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const maxCredits = 18;

  // Auth guard
  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== 'STUDENT') {
      removeToken();
      redirectToLogin();
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [coursesRes, enrolledRes] = await Promise.all([
        api<Course[]>('/api/courses'),
        api<Course[]>('/api/enrolled'),
      ]);
      setCourses(coursesRes.data || []);
      setEnrolled(enrolledRes.data || []);
      setTotalCredits(enrolledRes.totalCredits || 0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { removeToken(); redirectToLogin(); return; }
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (courseId: string) => {
    setError('');
    setSuccessMsg('');
    try {
      const res = await api<{ position?: number }>('/api/register', {
        method: 'POST',
        body: { courseId },
      });
      setSuccessMsg(res.message || 'Registered successfully!');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  const handleDrop = async (courseId: string) => {
    if (!confirm('Drop this course?')) return;
    setError('');
    setSuccessMsg('');
    try {
      const res = await api<{ promotedStudent?: unknown }>('/api/drop', {
        method: 'POST',
        body: { courseId },
      });
      setSuccessMsg(res.message || 'Course dropped.');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Drop failed');
    }
  };

  const handleLogout = () => { removeToken(); redirectToLogin(); };

  const enrolledIds = new Set(enrolled.map(c => c.id));
  const availableCourses = courses.filter(c => !enrolledIds.has(c.id));

  const isCourseDisabled = (course: Course): { disabled: boolean; reason: string } => {
    if (course.filledSeats >= course.capacity) {
      return { disabled: true, reason: 'Course is full — you will be waitlisted' };
    }
    if (totalCredits + course.credits > maxCredits) {
      return { disabled: true, reason: `Exceeds credit limit (${maxCredits} max). You have ${totalCredits}.` };
    }
    if (course.registrationEnd && new Date(course.registrationEnd) < new Date()) {
      return { disabled: true, reason: 'Registration window is closed' };
    }
    if (course.registrationStart && new Date(course.registrationStart) > new Date()) {
      return { disabled: true, reason: 'Registration window has not opened yet' };
    }
    return { disabled: false, reason: '' };
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <GraduationCap className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Student Hub</h1>
              <p className="text-xs text-slate-500">Browse courses and manage your schedule</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-400 hover:bg-white/10 transition-colors">
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>

        {/* Credits Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass mb-8 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-cyan-400" />
              <div>
                <p className="text-xs text-slate-500">Available Credits</p>
                <p className="text-3xl font-bold text-white">
                  <span className="text-gradient">{maxCredits - totalCredits}</span>
                  <span className="text-lg text-slate-500"> / {maxCredits}</span>
                </p>
              </div>
            </div>
            <div className="w-32">
              <div className="h-2 w-full rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
                  style={{ width: `${(totalCredits / maxCredits) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[10px] text-slate-500">{totalCredits} used</p>
            </div>
          </div>
        </motion.div>

        {/* Messages */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            <CheckCircle className="h-4 w-4 shrink-0" /> {successMsg}
          </div>
        )}

        {/* My Schedule */}
        {enrolled.length > 0 && (
          <div className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-white">My Schedule</h2>
              <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-400">{enrolled.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {enrolled.map((course, i) => (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass rounded-xl p-4 border-cyan-500/10"
                >
                  <h3 className="mb-2 font-semibold text-white">{course.title}</h3>
                  <div className="mb-3 grid grid-cols-2 gap-1.5 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <BookOpen className="h-3 w-3" /> {course.credits} credits
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="h-3 w-3" /> {course.startTime.slice(11, 16)}–{course.endTime.slice(11, 16)}
                    </div>
                    <div className="col-span-2 text-slate-400">
                      {course.daysOfWeek.map(d => DAY_NAMES[d]).join(' · ')}
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleDrop(course.id)}
                    className="glow-red w-full rounded-lg border border-red-500/20 bg-red-500/10 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Drop Course
                  </motion.button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Course Marketplace */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Course Marketplace</h2>
          </div>

          {availableCourses.length === 0 ? (
            <div className="glass rounded-xl py-12 text-center">
              <BookOpen className="mx-auto mb-3 h-10 w-10 text-slate-600" />
              <p className="text-slate-500">
                {enrolledIds.size > 0 ? 'You are enrolled in all available courses.' : 'No courses available yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {availableCourses.map((course, i) => {
                const { disabled, reason } = isCourseDisabled(course);
                const isFull = course.filledSeats >= course.capacity;

                return (
                  <motion.div
                    key={course.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={disabled ? {} : { scale: 1.02 }}
                    className={`glass rounded-xl p-5 transition-all ${disabled ? 'opacity-50' : 'hover:border-emerald-500/20'}`}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <h3 className="font-semibold text-white leading-tight">{course.title}</h3>
                      {isFull && (
                        <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
                          Waitlist
                        </span>
                      )}
                    </div>

                    <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-white/5 px-2 py-1.5">
                        <span className="text-slate-500">Credits:</span>{' '}
                        <span className="text-emerald-400 font-medium">{course.credits}</span>
                      </div>
                      <div className="rounded-md bg-white/5 px-2 py-1.5">
                        <span className="text-slate-500">Seats:</span>{' '}
                        <span className={`font-medium ${isFull ? 'text-red-400' : 'text-cyan-400'}`}>
                          {course.filledSeats}/{course.capacity}
                        </span>
                      </div>
                      <div className="rounded-md bg-white/5 px-2 py-1.5">
                        <span className="text-slate-500">Time:</span>{' '}
                        <span className="text-slate-300">{course.startTime.slice(11, 16)}–{course.endTime.slice(11, 16)}</span>
                      </div>
                      <div className="rounded-md bg-white/5 px-2 py-1.5">
                        <span className="text-slate-500">Days:</span>{' '}
                        <span className="text-slate-300">{course.daysOfWeek.map(d => DAY_NAMES[d]).join(', ')}</span>
                      </div>
                    </div>

                    {/* Capacity bar */}
                    <div className="mb-3 h-1.5 w-full rounded-full bg-white/5">
                      <div
                        className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min((course.filledSeats / course.capacity) * 100, 100)}%` }}
                      />
                    </div>

                    {course.prerequisites.length > 0 && (
                      <p className="mb-2 text-[10px] text-violet-400">
                        Requires {course.prerequisites.length} prerequisite(s)
                      </p>
                    )}

                    <div className="relative group">
                      <motion.button
                        whileHover={disabled ? {} : { scale: 1.03 }}
                        whileTap={disabled ? {} : { scale: 0.97 }}
                        onClick={() => !disabled && handleRegister(course.id)}
                        disabled={disabled && !isFull}
                        className={`w-full rounded-lg py-2.5 text-xs font-semibold transition-all ${
                          disabled && !isFull
                            ? 'cursor-not-allowed bg-white/5 text-slate-600'
                            : isFull
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {disabled && !isFull ? 'Unavailable' : isFull ? 'Join Waitlist' : 'Register'}
                      </motion.button>

                      {/* Tooltip for disabled */}
                      {disabled && reason && (
                        <div className="pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-3 py-1.5 text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                          {reason}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
