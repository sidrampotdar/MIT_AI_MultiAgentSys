import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api, ApiError } from '@/api/client';
import {
  UserPlus,
  Send,
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  Building2,
  GraduationCap,
  Briefcase,
  IndianRupee,
  Layers,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const intakeSchema = z.object({
  name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid personal email'),
  phone: z.string().min(8, 'Phone number is required'),
  department: z.string().min(2, 'Department is required'),
  designation: z.string().min(2, 'Designation is required'),
  reporting_manager: z.string().min(2, 'Reporting manager is required'),
  joining_date: z.string().min(4, 'Joining date is required'),
  annual_ctc: z.number().positive('Annual CTC must be a positive number'),
  university: z.string().min(2, 'Educational institution is required'),
  degree: z.string().min(2, 'Degree is required (e.g. BTech, MSc)'),
  branch: z.string().min(2, 'Branch / Specialization is required'),
  graduation_year: z.number().int().min(1980).max(2035, 'Invalid graduation year'),
  previous_employer: z.string().optional(),
  previous_designation: z.string().optional(),
  employment_dates: z.string().optional(),
  goal: z.string().min(10, 'Natural language business goal must be at least 10 characters'),
  simulate_documents: z.boolean(),
});

type FormData = z.infer<typeof intakeSchema>;

export const IntakePage: React.FC = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState<FormData>({
    name: 'Rahul Sharma',
    email: 'rahul.sharma@enterprise.test',
    phone: '+91 98765 43210',
    department: 'Platform Engineering',
    designation: 'Software Engineer',
    reporting_manager: 'Deepak Verma (VP Engineering)',
    joining_date: '2026-12-01',
    annual_ctc: 1200000,
    university: 'ABC Engineering College',
    degree: 'BTech',
    branch: 'Computer Science Engineering',
    graduation_year: 2024,
    previous_employer: 'Tech Innovators Inc',
    previous_designation: 'Junior Engineer',
    employment_dates: '2024 - 2026',
    goal: 'Onboard Rahul Sharma as Software Engineer in Platform Engineering. Verify educational qualifications with ABC Engineering College, previous employment with Tech Innovators, calculate approved salary, provision accounts, and prepare welcome orientation before 1 December 2026.',
    simulate_documents: true,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    workflow_id: string;
    employee_name: string;
    plan_steps: number;
  } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const val =
      type === 'number'
        ? Number(value)
        : type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : value;

    setFormData((prev) => ({ ...prev, [name]: val }));
    // Clear validation error on touch
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setServerError(null);

    // Zod validation
    const result = intakeSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormData, string>> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as keyof FormData;
        fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Submit onboarding workflow
      const res = await api.post<any>('/api/workflows/onboarding', {
        goal: formData.goal,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        department: formData.department,
        designation: formData.designation,
        reporting_manager: formData.reporting_manager,
        joining_date: formData.joining_date,
        annual_ctc: formData.annual_ctc,
        university: formData.university,
        degree: formData.degree,
        branch: formData.branch,
        graduation_year: formData.graduation_year,
        previous_employer: formData.previous_employer || '',
        previous_designation: formData.previous_designation || '',
        employment_dates: formData.employment_dates || '',
        simulate_documents: formData.simulate_documents,
      });

      setSubmissionSuccess({
        workflow_id: res.workflow_id,
        employee_name: formData.name,
        plan_steps: res.plan ? res.plan.length : 8,
      });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setServerError('Duplicate employee intake detected! An active onboarding record already exists for this email.');
      } else {
        setServerError(err.message || 'Failed to submit onboarding request. Please verify inputs.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submissionSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 animate-in zoom-in-95 duration-200">
        <div className="glass-panel rounded-3xl p-8 border border-emerald-500/40 glow-emerald text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-6">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Onboarding Workflow Initiated!
          </h2>
          <p className="text-sm text-slate-300 mt-2 max-w-md mx-auto">
            The Multi-Agent Planner decomposed the goal into {submissionSuccess.plan_steps} atomic tasks.
            Autonomous verification agents have commenced processing.
          </p>

          <div className="mt-6 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 font-mono text-left space-y-2">
            <div className="text-xs text-slate-400">
              Workflow ID: <span className="text-blue-400 font-bold">{submissionSuccess.workflow_id}</span>
            </div>
            <div className="text-xs text-slate-400">
              Candidate: <span className="text-white font-semibold">{submissionSuccess.employee_name}</span>
            </div>
            <div className="text-xs text-slate-400">
              Current Stage: <span className="text-amber-400 font-semibold">Document Validation & Approvals</span>
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/approvals')}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20"
            >
              <span>View Pending Approvals (HITL)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSubmissionSuccess(null)}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs glass-card hover:bg-slate-800 text-slate-200 transition-all"
            >
              Submit Another Candidate
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <UserPlus className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Employee Intake & Workflow Planner
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Submit new employee profile and specify natural-language business goals. The Planner Agent will decompose requirements into an authorized DAG execution plan.
        </p>
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Section 1: Candidate Core Information */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Building2 className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Candidate & Position Details
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Rahul Sharma"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.name && <p className="text-[11px] text-rose-400 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Personal Email Address <span className="text-rose-400">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="candidate@example.test"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.email && <p className="text-[11px] text-rose-400 mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Phone Number <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.phone && <p className="text-[11px] text-rose-400 mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Department <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.department && <p className="text-[11px] text-rose-400 mt-1">{errors.department}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Designation <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                name="designation"
                value={formData.designation}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.designation && <p className="text-[11px] text-rose-400 mt-1">{errors.designation}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Reporting Manager <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                name="reporting_manager"
                value={formData.reporting_manager}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.reporting_manager && (
                <p className="text-[11px] text-rose-400 mt-1">{errors.reporting_manager}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Joining Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                name="joining_date"
                value={formData.joining_date}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.joining_date && <p className="text-[11px] text-rose-400 mt-1">{errors.joining_date}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Annual Approved CTC (INR) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 text-xs">₹</span>
                <input
                  type="number"
                  name="annual_ctc"
                  value={formData.annual_ctc}
                  onChange={handleChange}
                  step={50000}
                  className="w-full pl-7 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              {errors.annual_ctc && <p className="text-[11px] text-rose-400 mt-1">{errors.annual_ctc}</p>}
            </div>
          </div>
        </div>

        {/* Section 2: Education & Verification Claims */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <GraduationCap className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Educational Qualification Claims
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                University / Institution <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                name="university"
                value={formData.university}
                onChange={handleChange}
                placeholder="e.g. ABC Engineering College"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.university && <p className="text-[11px] text-rose-400 mt-1">{errors.university}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Degree <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                name="degree"
                value={formData.degree}
                onChange={handleChange}
                placeholder="e.g. BTech"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.degree && <p className="text-[11px] text-rose-400 mt-1">{errors.degree}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Branch / Specialization <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                name="branch"
                value={formData.branch}
                onChange={handleChange}
                placeholder="e.g. Computer Science Engineering"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.branch && <p className="text-[11px] text-rose-400 mt-1">{errors.branch}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Graduation Year <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                name="graduation_year"
                value={formData.graduation_year}
                onChange={handleChange}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {errors.graduation_year && (
                <p className="text-[11px] text-rose-400 mt-1">{errors.graduation_year}</p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="simulate_documents"
                name="simulate_documents"
                checked={formData.simulate_documents}
                onChange={handleChange}
                className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500"
              />
              <label htmlFor="simulate_documents" className="text-xs text-slate-300 flex items-center gap-1.5 cursor-pointer">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <span>Simulate verified documents upload (Transcripts, Identity, Address proof)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Section 3: Previous Employment */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Briefcase className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              3. Previous Employment History
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Previous Employer</label>
              <input
                type="text"
                name="previous_employer"
                value={formData.previous_employer}
                onChange={handleChange}
                placeholder="e.g. Tech Innovators Inc"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Previous Designation</label>
              <input
                type="text"
                name="previous_designation"
                value={formData.previous_designation}
                onChange={handleChange}
                placeholder="e.g. Junior Engineer"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Employment Tenure</label>
              <input
                type="text"
                name="employment_dates"
                value={formData.employment_dates}
                onChange={handleChange}
                placeholder="e.g. 2024 - 2026"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Natural Language Business Goal */}
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              4. Natural-Language Business Goal
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Describe the desired business outcome. The Planner Agent will interpret this goal, identify missing inputs, and assemble an auditable multi-agent task execution graph.
          </p>
          <textarea
            name="goal"
            rows={4}
            value={formData.goal}
            onChange={handleChange}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-sans"
          />
          {errors.goal && <p className="text-[11px] text-rose-400">{errors.goal}</p>}
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-4 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className={`flex items-center gap-2.5 px-8 py-3 rounded-xl font-bold text-xs text-white shadow-xl transition-all ${
              isSubmitting
                ? 'bg-slate-700 cursor-not-allowed opacity-60'
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30 active:scale-95'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{isSubmitting ? 'Decomposing Tasks & Initiating Workflow...' : 'Submit Onboarding Request'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

