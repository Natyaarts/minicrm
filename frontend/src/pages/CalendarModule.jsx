import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import api from '../api/axios';
import { Calendar as CalendarIcon, RefreshCw, AlertCircle } from 'lucide-react';

const locales = {
    'en-US': enUS,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

const CalendarModule = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const response = await api.get('calendar-events/');
            // Parse start/end back to Date objects for react-big-calendar
            const formattedEvents = response.data.map(event => ({
                ...event,
                start: new Date(event.start),
                end: new Date(event.end)
            }));
            setEvents(formattedEvents);
            setError(null);
        } catch (err) {
            console.error('Error fetching calendar events:', err);
            setError('Failed to load calendar events. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const eventStyleGetter = (event) => {
        let backgroundColor = '#3174ad'; // default blue
        if (event.type === 'exam') {
            backgroundColor = '#ef4444'; // red for exams
        } else if (event.type === 'class') {
            backgroundColor = '#6366f1'; // indigo for classes
        }

        return {
            style: {
                backgroundColor,
                borderRadius: '4px',
                opacity: 0.9,
                color: 'white',
                border: '0px',
                display: 'block'
            }
        };
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <CalendarIcon className="text-indigo-600" /> Master Calendar
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">Unified view of all batches, classes, and upcoming exams.</p>
                </div>
                <button 
                    onClick={fetchEvents}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center gap-3">
                    <AlertCircle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="h-[700px]">
                    <Calendar
                        localizer={localizer}
                        events={events}
                        startAccessor="start"
                        endAccessor="end"
                        style={{ height: '100%', fontFamily: 'inherit' }}
                        eventPropGetter={eventStyleGetter}
                        views={['month', 'week', 'day', 'agenda']}
                        popup={true}
                    />
                </div>
                
                <div className="mt-6 flex gap-4 text-sm items-center justify-center border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                        <span className="text-slate-600 font-medium">Class Sessions</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500"></span>
                        <span className="text-slate-600 font-medium">Examinations</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CalendarModule;
