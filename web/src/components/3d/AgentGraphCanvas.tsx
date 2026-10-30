import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AgentDescriptor, AgentStatus } from '../../types';
import { Eye, EyeOff, Activity, ShieldCheck, Zap } from 'lucide-react';

interface AgentNodeProps {
  name: string;
  role: string;
  position: [number, number, number];
  status: AgentStatus;
  isPlanner?: boolean;
  isSelected: boolean;
  onSelect: (name: string) => void;
}

const statusColorMap: Record<AgentStatus, { color: string; emissive: string; intensity: number }> = {
  idle: { color: '#38bdf8', emissive: '#0284c7', intensity: 0.3 },
  executing: { color: '#10b981', emissive: '#059669', intensity: 1.2 },
  waiting: { color: '#f59e0b', emissive: '#d97706', intensity: 0.8 },
  blocked: { color: '#ef4444', emissive: '#b91c1c', intensity: 1.0 },
  error: { color: '#f43f5e', emissive: '#e11d48', intensity: 1.5 },
};

const AgentNode: React.FC<AgentNodeProps> = ({
  name,
  role,
  position,
  status,
  isPlanner,
  isSelected,
  onSelect,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const { color, emissive, intensity } = statusColorMap[status] || statusColorMap.idle;

  useFrame((state, delta) => {
    if (meshRef.current) {
      // Gentle floating animation
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + position[0]) * 0.1;

      // Pulse scaling if active or selected
      if (status === 'executing' || isSelected) {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.08;
        meshRef.current.scale.set(scale, scale, scale);
      } else {
        meshRef.current.scale.set(1, 1, 1);
      }
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.8;
      ringRef.current.rotation.x += delta * 0.4;
    }
  });

  const nodeRadius = isPlanner ? 0.65 : 0.45;

  return (
    <group position={position}>
      {/* Node Sphere */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(name);
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[nodeRadius, 32, 32]} />
        <meshStandardMaterial
          color={hovered || isSelected ? '#ffffff' : color}
          emissive={emissive}
          emissiveIntensity={intensity + (hovered ? 0.6 : 0)}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Orbital Ring for active or planner nodes */}
      {(isPlanner || status === 'executing' || hovered || isSelected) && (
        <mesh ref={ringRef}>
          <ringGeometry args={[nodeRadius * 1.3, nodeRadius * 1.45, 32]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent
            opacity={0.7}
          />
        </mesh>
      )}
    </group>
  );
};

// Connections between nodes
const ConnectionLine: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  active?: boolean;
}> = ({ start, end, active }) => {
  const lineObj = useMemo(() => {
    const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: active ? '#34d399' : '#334155',
      transparent: true,
      opacity: active ? 0.8 : 0.25,
      linewidth: active ? 2 : 1,
    });
    return new THREE.Line(geometry, material);
  }, [start, end, active]);

  useFrame((state) => {
    if (active && lineObj.material) {
      const mat = lineObj.material as THREE.LineBasicMaterial;
      mat.opacity = 0.4 + Math.sin(state.clock.elapsedTime * 6) * 0.4;
    }
  });

  return <primitive object={lineObj} />;
};

interface AgentGraphCanvasProps {
  agents?: AgentDescriptor[];
  selectedAgent?: string | null;
  onSelectAgent?: (agentName: string) => void;
  activeCollaborations?: Array<{ from: string; to: string }>;
}

export const AgentGraphCanvas: React.FC<AgentGraphCanvasProps> = ({
  agents = [],
  selectedAgent = null,
  onSelectAgent = () => {},
  activeCollaborations = [],
}) => {
  const [use3D, setUse3D] = useState(true);

  // Fallback default agents if none provided
  const standardAgents: AgentDescriptor[] = useMemo(() => {
    const defaults: AgentDescriptor[] = [
      { name: 'Planner Agent', role: 'planner', description: 'Orchestrates dynamic task DAGs', tools: ['create_plan', 'replan'], status: 'idle' },
      { name: 'Document Agent', role: 'document', description: 'Validates & extracts certificates', tools: ['extract_docs'], status: 'idle' },
      { name: 'Education Verification', role: 'verification', description: 'Coordinates university inquiries', tools: ['verify_degree'], status: 'idle' },
      { name: 'Employment Verification', role: 'verification', description: 'Checks previous employer records', tools: ['verify_service'], status: 'idle' },
      { name: 'Email Operations', role: 'communication', description: 'Drafts & manages outreach', tools: ['send_email'], status: 'idle' },
      { name: 'Finance Agent', role: 'finance', description: 'Calculates compensation & payroll', tools: ['compute_salary'], status: 'idle' },
      { name: 'HR Agent', role: 'hr', description: 'Oversees onboarding & final approvals', tools: ['approve_onboarding'], status: 'idle' },
      { name: 'Account Agent', role: 'it', description: 'Provisions enterprise credentials', tools: ['provision_user'], status: 'idle' },
      { name: 'Equipment Agent', role: 'it', description: 'Allocates hardware assets', tools: ['assign_hardware'], status: 'idle' },
      { name: 'Compliance Agent', role: 'compliance', description: 'Enforces statutory policies', tools: ['audit_policy'], status: 'idle' },
      { name: 'Communication Agent', role: 'communication', description: 'Schedules orientation sessions', tools: ['send_invite'], status: 'idle' },
    ];

    if (agents.length === 0) return defaults;
    return defaults.map((def) => {
      const match = agents.find((a) => a.name.toLowerCase().includes(def.role) || a.role === def.role);
      return match ? { ...def, status: match.status } : def;
    });
  }, [agents]);

  // Compute radial layout for nodes around the central Planner
  const nodePositions = useMemo(() => {
    const positions: Record<string, [number, number, number]> = {};
    positions['Planner Agent'] = [0, 0, 0];

    const satellites = standardAgents.filter((a) => a.name !== 'Planner Agent');
    const total = satellites.length;
    const radius = 3.6;

    satellites.forEach((agent, i) => {
      const angle = (i / total) * Math.PI * 2;
      positions[agent.name] = [
        Math.cos(angle) * radius,
        Math.sin(angle) * (radius * 0.65),
        Math.sin(angle * 2) * 0.4,
      ];
    });

    return positions;
  }, [standardAgents]);

  const activeAgentInfo = standardAgents.find((a) => a.name === selectedAgent);

  return (
    <div className="relative w-full h-[460px] bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Top Bar Controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center space-x-2 bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800/80 pointer-events-auto backdrop-blur-md">
          <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200">
            Multi-Agent Neural Fabric
          </span>
          <span className="px-1.5 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 rounded font-mono">
            {standardAgents.length} Agents Live
          </span>
        </div>

        <div className="flex items-center space-x-2 pointer-events-auto">
          <button
            onClick={() => setUse3D(!use3D)}
            className="flex items-center space-x-1.5 text-xs bg-slate-950/80 hover:bg-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl border border-slate-800 transition"
            title="Toggle between WebGL 3D Canvas and Accessible 2D Vector Graph"
          >
            {use3D ? (
              <>
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>3D View</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>2D Simplified</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Selected Agent Quick Pill */}
      {activeAgentInfo && (
        <div className="absolute bottom-4 left-4 z-10 max-w-sm bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{activeAgentInfo.name}</span>
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${
                activeAgentInfo.status === 'executing'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {activeAgentInfo.status}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {activeAgentInfo.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {activeAgentInfo.tools.map((t) => (
              <span
                key={t}
                className="text-[10px] font-mono bg-slate-900 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-950"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Canvas Render (3D or 2D Accessible Fallback) */}
      {use3D ? (
        <Canvas camera={{ position: [0, 0, 7.2], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <pointLight position={[10, 10, 10]} intensity={1.2} />
          <pointLight position={[-10, -10, -5]} intensity={0.5} color="#38bdf8" />

          {/* Center to Satellites Connections */}
          {Object.entries(nodePositions).map(([name, pos]) => {
            if (name === 'Planner Agent') return null;
            const plannerPos = nodePositions['Planner Agent'];
            const isCollaborating = activeCollaborations.some(
              (c) => (c.from === name && c.to === 'Planner Agent') || (c.from === 'Planner Agent' && c.to === name)
            );
            return (
              <ConnectionLine
                key={`line-${name}`}
                start={plannerPos}
                end={pos}
                active={isCollaborating}
              />
            );
          })}

          {/* Render Nodes */}
          {standardAgents.map((agent) => {
            const pos = nodePositions[agent.name] || [0, 0, 0];
            return (
              <AgentNode
                key={agent.name}
                name={agent.name}
                role={agent.role}
                position={pos}
                status={agent.status}
                isPlanner={agent.name === 'Planner Agent'}
                isSelected={selectedAgent === agent.name}
                onSelect={(name) => onSelectAgent(name)}
              />
            );
          })}
        </Canvas>
      ) : (
        /* Accessible 2D Fallback */
        <div className="w-full h-full flex flex-col justify-center items-center p-6 bg-slate-950/90 overflow-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full max-w-2xl">
            {standardAgents.map((agent) => (
              <button
                key={agent.name}
                onClick={() => onSelectAgent(agent.name)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  selectedAgent === agent.name
                    ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-lg'
                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold">{agent.name}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      agent.status === 'executing' ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                </div>
                <span className="text-[10px] text-slate-400 uppercase font-mono">
                  {agent.role}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
