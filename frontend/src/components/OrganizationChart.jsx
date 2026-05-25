import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Building2, Briefcase } from 'lucide-react';

const buildTree = (employees) => {
    const map = {};
    const roots = [];

    // Create a copy and initialize children
    employees.forEach(emp => {
        map[emp.id] = { ...emp, children: [] };
    });

    // Populate children
    employees.forEach(emp => {
        if (emp.reporting_to && map[emp.reporting_to]) {
            map[emp.reporting_to].children.push(map[emp.id]);
        } else {
            // If reporting_to is null or points to a deleted employee, it's a root
            roots.push(map[emp.id]);
        }
    });

    return roots;
};

const OrgNode = ({ node, isFirst, isLast, isOnlyChild, isRoot }) => {
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div className="flex flex-col items-center relative px-1 sm:px-2">
            {/* Horizontal Line connecting siblings */}
            {!isRoot && !isOnlyChild && (
                <div className="absolute top-0 h-px bg-indigo-200 z-0" 
                    style={{
                        left: isFirst ? '50%' : '0',
                        right: isLast ? '50%' : '0',
                        width: isFirst && isLast ? '0' : 'auto'
                    }}
                />
            )}

            {/* Vertical line connecting from horizontal to the card */}
            {!isRoot && (
                <div className="w-px h-6 bg-indigo-200 z-0"></div>
            )}

            {/* The Employee Card */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 w-44 sm:w-56 bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-400 hover:-translate-y-1 transition-all duration-300 group cursor-default"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity"></div>
                <div className="flex flex-col items-center relative z-10">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-white mb-3 shadow-lg bg-gradient-to-br from-indigo-500 to-violet-600 transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 ring-4 ring-indigo-50">
                        {node.full_name?.[0] || node.display_username?.[0].toUpperCase()}
                    </div>
                    <h4 className="font-bold text-slate-800 text-center text-sm mb-1">{node.full_name || node.display_username}</h4>
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3 text-center">{node.designation_name || 'No Role'}</p>
                    
                    <div className="flex w-full items-center justify-center gap-2 text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-2 rounded-xl border border-slate-100 group-hover:bg-white transition-colors">
                        <Building2 size={12} className="text-indigo-400 shrink-0" />
                        <span className="truncate">{node.department_name || 'Unassigned'}</span>
                    </div>
                </div>
            </motion.div>

            {/* Vertical line below the card if there are children */}
            {hasChildren && (
                <div className="w-px h-6 bg-indigo-200 z-0"></div>
            )}

            {/* Render Children */}
            {hasChildren && (
                <div className="flex justify-center relative">
                    {node.children.map((child, index) => (
                        <OrgNode 
                            key={child.id} 
                            node={child} 
                            isRoot={false}
                            isFirst={index === 0}
                            isLast={index === node.children.length - 1}
                            isOnlyChild={node.children.length === 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const OrganizationChart = ({ employees }) => {
    const roots = useMemo(() => buildTree(employees), [employees]);

    if (!employees || employees.length === 0) {
        return (
            <div className="text-center p-12 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 text-slate-500">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                    <Briefcase className="text-slate-400" size={24} />
                </div>
                <h3 className="font-bold text-slate-700">No Workforce Data</h3>
                <p className="text-xs mt-1">Add employees and assign reporting managers to build the chart.</p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 overflow-x-auto min-h-[500px] cursor-grab active:cursor-grabbing pb-20 custom-scrollbar">
            <div className="min-w-fit mx-auto flex justify-center pt-4">
                {roots.map(rootNode => (
                    <OrgNode 
                        key={rootNode.id} 
                        node={rootNode} 
                        isRoot={true}
                        isFirst={true}
                        isLast={true}
                        isOnlyChild={true}
                    />
                ))}
            </div>
        </div>
    );
};

export default OrganizationChart;
