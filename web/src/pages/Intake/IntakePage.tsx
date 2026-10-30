import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../../api/client';
import {
  UserPlus,
  Building,
  GraduationCap,
  Briefcase,
  DollarSign,
  FileText,
  AlertCircle,
  CheckCircle,
  Upload,
  ArrowRight,
  Shield,
  Sparkles,
} from 'lucide-react';

const intakeSchema = z.object({
  fullName: z.string().min(2, 'Full name is required (min 2 characters)'),
  personalEmail: z.string().email('Valid personal email is required'),
  phone: z.string().min(7, 'Valid phone number is required'),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
  reportingManager: z.string().min(2, 'Reporting manager is required'),
  joiningDate: z.string().min(1, 'Joining date is required'),
  employmentType: z.enum(['Full-Time', 'Contract', 'Intern']),
  universityName: z.string().min(2, 'University name is required'),
  degree: z.string().min(2, 'Degree and branch is required'),
  graduationYear: z.coerce.number().min(1970).max(2030),
  proposedCtc: z.coerce.number().min(100000, 'Minimum CTC is 100,000'),
  previousEmployer: z.string().optional(),
  previousDesignation: z.string().optional(),
  onboardingObjective: z.string().optional(),
});

type IntakeFormData = z.infer<typeof intakeSchema>;

export const IntakePage: React.FC = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [documentsAttached, setDocumentsAttached] = useState<boolean>(true);

  const [form, setForm] = useState<IntakeFormData>({
    fullName: 'David Sterling',
    personalEmail: 'david.sterling@example.com',
    phone: '+1-555-019-2834',
    department: 'Engineering',
    designation: 'Senior Distributed Systems Architect',
    reportingManager: 'Sarah Connor',
    joiningDate: '2026-11-15',
    employmentType: 'Full-Time',
    universityName: 'Massachusetts Institute of Technology',
    degree: 'B.S. in Computer Science & AI',
    graduationYear: 2020,
    proposedCtc: 1800000,
    previousEmployer: 'Apex Cloud Innovations',
    previousDesignation: 'Systems Engineer',
    onboardingObjective:
      'Fast-track credentials provisioning, priority laptop allocation, and complete university transcript verification before first day.',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // Prevent duplicate clicks

    // Validate with Zod
    const validation = intakeSchema.safeParse(form);
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.issues.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setServerError(null);

    try {
      // 1. Submit Employee Registration
      const [firstName, ...rest] = form.fullName.trim().split(' ');
      const lastName = rest.join(' ') || 'Candidate';

      const employeePayload = {
        name: form.fullName,
        first_name: firstName,
        last_name: lastName,
        email: form.personalEmail,
        personal_email: form.personalEmail,
        phone: form.phone,
        department: form.department,
        designation: form.designation,
        reporting_manager: form.reportingManager,
        joining_date: form.joiningDate,
        employment_type: form.employmentType,
        university_name: form.universityName,
        degree: form.degree,
        graduation_year: form.graduationYear,
        proposed_ctc: form.proposedCtc,
        previous_employer: form.previousEmployer || undefined,
      };

      try {
        await api.post('/api/employees', employeePayload);
      } catch (err: any) {
        console.warn('Employee register notice:', err.message);
      }

      // 2. Start Onboarding Workflow
      const workflowRes = await api.post<{ workflow_id: string; status: string }>(
        '/api/workflows/onboarding',
        {
          name: form.fullName,
          email: form.personalEmail,
          phone: form.phone,
          department: form.department,
          designation: form.designation,
          reporting_manager: form.reportingManager,
          joining_date: form.joiningDate,
          employment_type: form.employmentType.toLowerCase().replace('-', '_'),
          annual_ctc: Number(form.proposedCtc),
          university: form.universityName,
          objective: form.onboardingObjective || 'Complete autonomous onboarding',
          missing_documents: documentsAttached ? [] : ['degree_certificate'],
        }
      );

      const generatedWfId = workflowRes.workflow_id;
      if (generatedWfId) {
        navigate(`/monitor/${encodeURIComponent(generatedWfId)}`);
      } else {
        navigate('/monitor');
      }
    } catch (err: any) {
      setServerError(err.message || 'Failed to initiate onboarding workflow');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Employee Onboarding Intake</h1>
            <p className="text-xs text-slate-400">
              Formally register an enterprise recruit and trigger the autonomous multi-agent onboarding pipeline.
            </p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl flex items-center space-x-3 text-rose-300 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Personal Details */}
        <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white pb-2 border-b border-slate-800">
            <Building className="w-4 h-4 text-indigo-400" />
            <span>Personal & Enterprise Assignment</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Full Legal Name *</label>
              <input
                type="text"
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
              {errors.fullName && <p className="text-rose-400 text-[11px] mt-1">{errors.fullName}</p>}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Personal Email *</label>
              <input
                type="email"
                name="personalEmail"
                value={form.personalEmail}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
              {errors.personalEmail && (
                <p className="text-rose-400 text-[11px] mt-1">{errors.personalEmail}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Phone Number *</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
              {errors.phone && <p className="text-rose-400 text-[11px] mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Department *</label>
              <input
                type="text"
                name="department"
                value={form.department}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
              {errors.department && <p className="text-rose-400 text-[11px] mt-1">{errors.department}</p>}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Designation *</label>
              <input
                type="text"
                name="designation"
                value={form.designation}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
              {errors.designation && (
                <p className="text-rose-400 text-[11px] mt-1">{errors.designation}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Reporting Manager *</label>
              <input
                type="text"
                name="reportingManager"
                value={form.reportingManager}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
              {errors.reportingManager && (
                <p className="text-rose-400 text-[11px] mt-1">{errors.reportingManager}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Joining Date *</label>
              <input
                type="date"
                name="joiningDate"
                value={form.joiningDate}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
              {errors.joiningDate && (
                <p className="text-rose-400 text-[11px] mt-1">{errors.joiningDate}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Employment Type *</label>
              <select
                name="employmentType"
                value={form.employmentType}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Full-Time">Full-Time (Regular)</option>
                <option value="Contract">Contract</option>
                <option value="Intern">Internship</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Education & CTC */}
        <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white pb-2 border-b border-slate-800">
            <GraduationCap className="w-4 h-4 text-emerald-400" />
            <span>Academic Qualifications & Proposed CTC</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">University / Institute *</label>
              <input
                type="text"
                name="universityName"
                value={form.universityName}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
              {errors.universityName && (
                <p className="text-rose-400 text-[11px] mt-1">{errors.universityName}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Degree & Branch *</label>
              <input
                type="text"
                name="degree"
                value={form.degree}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
              {errors.degree && <p className="text-rose-400 text-[11px] mt-1">{errors.degree}</p>}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Graduation Year *</label>
              <input
                type="number"
                name="graduationYear"
                value={form.graduationYear}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
              {errors.graduationYear && (
                <p className="text-rose-400 text-[11px] mt-1">{errors.graduationYear}</p>
              )}
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Proposed Annual CTC (INR/USD) *</label>
              <input
                type="number"
                name="proposedCtc"
                value={form.proposedCtc}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
              {errors.proposedCtc && (
                <p className="text-rose-400 text-[11px] mt-1">{errors.proposedCtc}</p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Previous Employment & Documents */}
        <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white pb-2 border-b border-slate-800">
            <Briefcase className="w-4 h-4 text-purple-400" />
            <span>Employment History & Verification Documents</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Previous Employer (if applicable)</label>
              <input
                type="text"
                name="previousEmployer"
                value={form.previousEmployer || ''}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Previous Designation</label>
              <input
                type="text"
                name="previousDesignation"
                value={form.previousDesignation || ''}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Document Upload Simulation */}
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-5 h-5 text-indigo-400" />
              <div>
                <span className="text-xs font-semibold text-white">
                  Attach Standard Onboarding Packet
                </span>
                <p className="text-[11px] text-slate-400">
                  Includes Degree Certificate, Relieving Letter, and Gov ID for Document Agent parsing.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDocumentsAttached(!documentsAttached)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                documentsAttached
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {documentsAttached ? '✓ Documents Attached' : '+ Attach Packet'}
            </button>
          </div>
        </div>

        {/* Section 4: Natural-Language Objective */}
        <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800 space-y-2">
          <label className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Autonomous Onboarding Objective (Natural Language)</span>
          </label>
          <p className="text-[11px] text-slate-400">
            The Planner Agent interprets this prompt to synthesize the initial execution DAG.
          </p>
          <textarea
            name="onboardingObjective"
            rows={3}
            value={form.onboardingObjective || ''}
            onChange={handleChange}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
            placeholder="e.g. Verify university credentials, coordinate IT account generation, setup orientation calendar..."
          />
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-4 py-2.5 rounded-xl border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-6 py-2.5 rounded-xl text-xs font-semibold shadow-xl shadow-indigo-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span>Synthesizing Workflow...</span>
            ) : (
              <>
                <span>Launch Autonomous Pipeline</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
