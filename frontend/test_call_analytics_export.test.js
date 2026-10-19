import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure generator function extracting the exact export logic from CallAnalyticsDashboard.jsx
 * for automated unit testing under Node.js.
 */
function generateCallAnalyticsCSV(data, activeTab) {
    if (!data) return '';
    let csvContent = '';

    if (activeTab === 'history') {
        csvContent += "Date & Time,Sales Executive,Client Name,Direction,Status,Duration\n";
        (data.history || []).forEach(call => {
            const dateStr = new Date(call.date).toLocaleString().replace(/,/g, '');
            const row = `${dateStr},${call.employee},${call.client},${call.direction},${call.status || 'UNKNOWN'},${call.duration}s`;
            csvContent += row + "\n";
        });
    } else {
        csvContent += "Sr. No.,Employee,Total Calls,Total Duration (s),Connected Calls,Connected Duration (s),Unique Clients\n";
        (data.employee_summary || []).forEach(emp => {
            const row = `${emp.sr_no},${emp.name},${emp.total_calls},${emp.total_duration},${emp.connected_calls},${emp.connected_duration},${emp.unique_clients}`;
            csvContent += row + "\n";
        });
    }
    return csvContent;
}

test('Call Analytics CSV Export - History Tab with Filtered Records', () => {
    const mockData = {
        history: [
            {
                date: '2026-04-10T10:30:00Z',
                employee: 'Priya Sharma',
                client: 'Ananya Verma',
                direction: 'OUTGOING',
                status: 'CONNECTED',
                duration: 145
            },
            {
                date: '2026-04-10T11:15:00Z',
                employee: 'Priya Sharma',
                client: 'Rahul Gupta',
                direction: 'INCOMING',
                status: null, // should fallback to UNKNOWN
                duration: 0
            }
        ]
    };

    const csv = generateCallAnalyticsCSV(mockData, 'history');
    const lines = csv.trim().split('\n');

    assert.equal(lines.length, 3, 'Should produce 1 header line and 2 data lines');
    assert.equal(lines[0], 'Date & Time,Sales Executive,Client Name,Direction,Status,Duration');

    // Verify row 1 contains expected filtered fields and '145s'
    assert.match(lines[1], /Priya Sharma,Ananya Verma,OUTGOING,CONNECTED,145s$/);

    // Verify row 2 uses UNKNOWN fallback when status is null
    assert.match(lines[2], /Priya Sharma,Rahul Gupta,INCOMING,UNKNOWN,0s$/);
});

test('Call Analytics CSV Export - Summary Tab with Filtered Rep Summaries', () => {
    const mockData = {
        employee_summary: [
            {
                sr_no: 1,
                name: 'Priya Sharma',
                total_calls: 15,
                total_duration: 1800,
                connected_calls: 10,
                connected_duration: 1650,
                unique_clients: 12
            },
            {
                sr_no: 2,
                name: 'Vikram Singh',
                total_calls: 8,
                total_duration: 900,
                connected_calls: 5,
                connected_duration: 750,
                unique_clients: 6
            }
        ]
    };

    const csv = generateCallAnalyticsCSV(mockData, 'summary');
    const lines = csv.trim().split('\n');

    assert.equal(lines.length, 3, 'Should produce 1 header line and 2 data lines');
    assert.equal(lines[0], 'Sr. No.,Employee,Total Calls,Total Duration (s),Connected Calls,Connected Duration (s),Unique Clients');
    assert.equal(lines[1], '1,Priya Sharma,15,1800,10,1650,12');
    assert.equal(lines[2], '2,Vikram Singh,8,900,5,750,6');
});

test('Call Analytics CSV Export - Empty Filtered Dataset', () => {
    const mockDataEmpty = {
        history: [],
        employee_summary: []
    };

    const csvHistory = generateCallAnalyticsCSV(mockDataEmpty, 'history');
    const historyLines = csvHistory.trim().split('\n');
    assert.equal(historyLines.length, 1, 'Empty history should have only header');
    assert.equal(historyLines[0], 'Date & Time,Sales Executive,Client Name,Direction,Status,Duration');

    const csvSummary = generateCallAnalyticsCSV(mockDataEmpty, 'summary');
    const summaryLines = csvSummary.trim().split('\n');
    assert.equal(summaryLines.length, 1, 'Empty summary should have only header');
    assert.equal(summaryLines[0], 'Sr. No.,Employee,Total Calls,Total Duration (s),Connected Calls,Connected Duration (s),Unique Clients');
});

test('Call Analytics CSV Export - Null or Undefined Data Guard', () => {
    assert.equal(generateCallAnalyticsCSV(null, 'history'), '');
    assert.equal(generateCallAnalyticsCSV(undefined, 'summary'), '');
});
