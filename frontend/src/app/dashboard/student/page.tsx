'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Clock, Calendar, LogOut, User, CheckCircle2,
  AlertTriangle, XCircle, Loader2, GraduationCap, Star
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getPayload, logout, isAuthenticated, getRole } from '@/lib/auth';

/* ─────────────── Types ─────────────── */
interface CourseCard {
  id: string; title: string; capacity: number; filledSeats: number;
  credits: number; startTime: string; endTime: string; daysOfWeek: number[];
  prerequisiteCount: number; missingPrereqCount: number;
  myStatus: 'ENROLLED' | 'DROPPED' | 'WAITLISTED' | null;
  waitlistPosition: number | null; isFull: boolean;
}

interface EnrolledCourse {
  registrationId: string; courseId: string; title: string;
  credits: number; startTime: string; endTime: string;
  daysOfWeek: number[]; status: string;
}

interface WaitlistedCourse {
  registrationId: string; courseId: string; title: string;
  credits: number; waitlistPosition: number | null; status: string;
}

interface ScheduleData {
  usedCredits: number;
  user: { name: string; email: string };
  enrolled: EnrolledCourse[];
  waitlisted: WaitlistedCourse[];
}

interface CoursesRes  { success: boolean; data: CourseCard[] }
interface ScheduleRes { success: boolean; data: ScheduleData }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_CREDITS = 18;

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toUTCString().slice(17, 22);
}

/* ─────────────── Component ─────────────── */
export default function StudentDashboard() {
  const router  = useRouter();
  const payload = getPayload();

  const [courses, setCourses]     = useState<CourseCard[]>([]);
  const [schedule, setSchedule]   = useState<ScheduleData | null>(null);
  const [loadingC, setLC]         = useState(true);
  const [loadingS, setLS]         = useState(true);
  const [actionId, setActionId]   = useState<string | null>(null);
  const [toast, setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [tab, setTab]             = useState<'marketplace' | 'schedule'>('marketplace');

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated() || getRole() === 'ADMIN') {
      router.replace('/login');
    }
  }, [router]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchAll = useCallback(async () => {
    setLC(true); setLS(true);
    try {
      const [c, s] = await Promise.all([
        apiRequest<CoursesRes>('/api/courses'),
        apiRequest<ScheduleRes>('/api/my/registrations'),
      ]);
      setCourses(c.data);
      setSchedule(s.data);
    } finally {
      setLC(false); setLS(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const register = async (courseId: string) => {
    setActionId(courseId);
    try {
      const res = await apiRequest<{ success: boolean; waitlisted: boolean; message: string }>(
        '/api/register', 'POST', { courseId }
      );
      showToast(res.message, 'success');
      fetchAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Registration failed.', 'error');
    } finally {
      setActionId(null);
    }
  };

  const drop = async (courseId: string) => {
    setActionId(courseId);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>(
        '/api/drop', 'POST', { courseId }
      );
      showToast(res.message, 'success');
      fetchAll();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Drop failed.', 'error');
    } finally {
      setActionId(null);
    }
  };

  const usedCredits    = schedule?.usedCredits ?? 0;
  const creditPct      = Math.min(100, Math.round((usedCredits / MAX_CREDITS) * 100));
  const creditBarColor = creditPct >= 90 ? 'from-red-500 to-red-400' : creditPct >= 60 ? 'from-amber-500 to-amber-400' : 'from-emerald-500 to-cyan-400';

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl glass glow-emerald flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Student Hub</h1>
            <p className="text-xs text-slate-500">{schedule?.user?.name ?? `ID …${payload?.userId?.slice(-6)}`}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white glass px-4 py-2 rounded-xl transition-colors"
        >
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>

      {/* ── Credit Gauge ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-5 mb-6 glow-emerald"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold text-white">Available Credits</span>
          </div>
          <span className="text-sm font-bold text-white">
            <span className={creditPct >= 90 ? 'text-red-400' : 'text-emerald-400'}>{usedCredits}</span>
            <span className="text-slate-500"> / {MAX_CREDITS}</span>
          </span>
        </div>
        <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${creditPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full bg-gradient-to-r ${creditBarColor}`}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1.5">
          <span>{schedule?.enrolled?.length ?? 0} courses enrolled</span>
          <span>{MAX_CREDITS - usedCredits} credits remaining</span>
        </div>
      </motion.div>

      {/* ── Tab Switcher ── */}
      <div className="flex gap-2 mb-6">
        {(['marketplace', 'schedule'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t
                ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-900 glow-cyan'
                : 'glass text-slate-400 hover:text-white'
            }`}
          >
            {t === 'marketplace' ? '🛒 Marketplace' : '📅 My Schedule'}
          </button>
        ))}
      </div>

      {/* ── Marketplace ── */}
      {tab === 'marketplace' && (
        <div>
          <p className="text-xs text-slate-500 mb-4">{courses.length} courses available</p>
          {loadingC ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {courses.map((course, i) => {
                const isEnrolled    = course.myStatus === 'ENROLLED';
                const isWaitlisted  = course.myStatus === 'WAITLISTED';
                const missingPrereq = course.missingPrereqCount > 0;
                const isDimmed      = missingPrereq || isEnrolled;
                const busy          = actionId === course.id;

                return (
                  <motion.div
                    key={course.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    whileHover={!isDimmed ? { scale: 1.02, y: -3 } : {}}
                    className={`glass rounded-2xl p-5 flex flex-col gap-3 transition-all ${isDimmed ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-white text-sm leading-tight">{course.title}</h3>
                      {isEnrolled && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {isWaitlisted && <Clock className="w-4 h-4 text-amber-400 shrink-0" />}
                    </div>

                    <div className="flex gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{formatTime(course.startTime)}–{formatTime(course.endTime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />{course.daysOfWeek.map(d => DAYS[d]).join(', ')}
                      </span>
                    </div>

                    <div className="flex gap-2 flex-wrap text-xs">
                      <span className="glass px-2 py-1 rounded-lg text-cyan-400">{course.credits} cr</span>
                      <span className={`glass px-2 py-1 rounded-lg ${course.isFull ? 'text-red-400' : 'text-emerald-400'}`}>
                        {course.filledSeats}/{course.capacity} seats
                      </span>
                      {course.prerequisiteCount > 0 && (
                        <span className={`glass px-2 py-1 rounded-lg ${missingPrereq ? 'text-red-400' : 'text-slate-400'}`}>
                          {missingPrereq ? `${course.missingPrereqCount} prereq missing` : '✓ Prereqs met'}
                        </span>
                      )}
                    </div>

                    {/* Action button */}
                    {isEnrolled ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-400 glass py-2 rounded-xl px-4 justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Enrolled
                      </div>
                    ) : isWaitlisted ? (
                      <div className="flex items-center gap-2 text-xs text-amber-400 glass py-2 rounded-xl px-4 justify-center">
                        <Clock className="w-3.5 h-3.5" /> Waitlisted #{course.waitlistPosition}
                      </div>
                    ) : missingPrereq ? (
                      <div className="flex items-center gap-2 text-xs text-red-400 glass py-2 rounded-xl px-4 justify-center" title="Complete prerequisites first">
                        <XCircle className="w-3.5 h-3.5" /> Prerequisites Required
                      </div>
                    ) : course.isFull ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        onClick={() => register(course.id)}
                        disabled={busy}
                        className="flex items-center justify-center gap-2 text-xs text-amber-400 font-semibold glass py-2 rounded-xl px-4 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        Join Waitlist
                      </motion.button>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        onClick={() => register(course.id)}
                        disabled={busy}
                        className="flex items-center justify-center gap-2 text-xs text-slate-900 font-semibold bg-gradient-to-r from-cyan-500 to-emerald-400 py-2 rounded-xl px-4 glow-cyan disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                        Register
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── My Schedule ── */}
      {tab === 'schedule' && (
        <div className="space-y-3">
          {loadingS ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-400 animate-spin" /></div>
          ) : schedule?.enrolled?.length === 0 && schedule?.waitlisted?.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No courses yet. Head to the Marketplace!</p>
            </div>
          ) : (
            <>
              {(schedule?.enrolled ?? []).map((c, i) => (
                <motion.div
                  key={c.registrationId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass rounded-2xl p-5 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <h3 className="font-semibold text-white text-sm truncate">{c.title}</h3>
                    </div>
                    <div className="flex gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(c.startTime)}–{formatTime(c.endTime)}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{c.daysOfWeek.map(d => DAYS[d]).join(', ')}</span>
                      <span className="text-cyan-400">{c.credits} credits</span>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
                    onClick={() => drop(c.courseId)}
                    disabled={actionId === c.courseId}
                    className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-red-400 glass px-4 py-2 rounded-xl glow-red hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {actionId === c.courseId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Drop
                  </motion.button>
                </motion.div>
              ))}

              {(schedule?.waitlisted ?? []).length > 0 && (
                <>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pt-2">Waitlisted</p>
                  {(schedule?.waitlisted ?? []).map((c, i) => (
                    <motion.div
                      key={c.registrationId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="glass rounded-2xl p-5 flex items-center justify-between gap-4 opacity-70"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-amber-400" />
                          <h3 className="font-semibold text-white text-sm">{c.title}</h3>
                        </div>
                        <div className="flex gap-3 text-xs text-slate-400">
                          <span className="text-amber-400">Position #{c.waitlistPosition}</span>
                          <span className="text-cyan-400">{c.credits} credits</span>
                        </div>
                      </div>
                      <span className="text-xs glass px-3 py-1.5 rounded-lg text-amber-400">Waitlisted</span>
                    </motion.div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={`fixed bottom-6 left-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium shadow-xl ${
              toast.type === 'success'
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 glow-emerald'
                : 'bg-red-500/20 border border-red-500/30 text-red-300 glow-red'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
