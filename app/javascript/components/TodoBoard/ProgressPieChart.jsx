// src/components/ProgressPieChart.js
import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getCompletionData } from '/utils/taskUtils';
import { FiPieChart, FiCheckCircle, FiTrendingUp, FiList } from 'react-icons/fi';

const ProgressPieChart = ({ columns }) => {
  const data = getCompletionData(columns);
  const totalTasks = data.reduce((sum, entry) => sum + entry.value, 0);

  const renderLegend = () => {
    return (
      <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-3 sm:mt-6 sm:gap-x-6">
        {data.map((entry) => {
          let Icon;
          switch (entry.name) {
            case 'To Do': Icon = FiList; break;
            case 'In Progress': Icon = FiTrendingUp; break;
            case 'Completed': Icon = FiCheckCircle; break;
            default: Icon = FiPieChart;
          }
          return (
            <div key={entry.name} className="flex flex-col items-center px-2">
              <div className="flex items-center text-base font-semibold" style={{ color: entry.fill }}>
                <Icon className="mr-2" />
                <span>{entry.name}</span>
              </div>
              <span className="text-xl font-bold text-gray-700 mt-1">{entry.value}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center mb-4">
        <FiPieChart className="text-theme mr-3" size={24} />
        <h3 className="text-xl font-bold text-gray-800">Progress Overview</h3>
      </div>
      <div className="relative w-full flex-grow flex items-center justify-center min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={false}
              innerRadius={60}
              outerRadius={80}
              fill="#8884d8"
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`${value} tasks`, null]}
              contentStyle={{
                  background: 'rgba(255, 255, 255, 0.9)',
                  border: '1px solid #e0e0e0',
                  borderRadius: '10px',
                  backdropFilter: 'blur(5px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
              cursor={{ fill: 'rgba(200, 200, 200, 0.2)' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute text-center pointer-events-none">
          <span className="text-4xl font-bold text-gray-800">{totalTasks}</span>
          <p className="text-sm text-gray-500">Total Tasks</p>
        </div>
      </div>
      {renderLegend()}
    </div>
  );
};

export default ProgressPieChart;
