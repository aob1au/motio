import { jsPDF } from 'jspdf';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import type { Task, Project, Assignee, Status, Milestone, TimeOff } from '@/features/planner/types/planner';
import { buildPersonColorMap } from '@/features/planner/lib/timeOffPalette';
import { getTaskBarAppearance } from '@/features/planner/lib/taskBarColors';
import { formatProjectLabel } from '@/shared/lib/projectLabels';

export interface ExportRow {
  name: string;
  team?: string;
  assigneeId?: string;
  tasks: Task[];
  timeOff?: TimeOff[];
}

export interface TimelinePdfOptions {
  startDate: string;
  endDate: string;
  paper: 'a3' | 'a4';
  title: string;
  teamRows: ExportRow[];
  projectRows: ExportRow[];
  projects: Project[];
  assignees: Assignee[];
  statuses: Status[];
  milestones: Milestone[];
}

export function exportTimelinePdf(options: TimelinePdfOptions) {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: options.paper,
    compress: true,
  });

  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const sidebar = options.paper === 'a3' ? 52 : 42;
  const gridX = margin + sidebar;
  const gridWidth = W - gridX - margin;
  const days = eachDayOfInterval({
    start: parseISO(options.startDate),
    end: parseISO(options.endDate),
  });
  const keys = days.map(d => format(d, 'yyyy-MM-dd'));
  const dayWidth = gridWidth / days.length;
  const personColors = buildPersonColorMap(options.assignees);
  const projectMap = new Map(options.projects.map(p => [p.id, p]));
  const personMap = new Map(options.assignees.map(p => [p.id, p]));
  const statusMap = new Map(options.statuses.map(s => [s.id, s]));
  const laneHeight = options.paper === 'a3' ? 11 : 10;
  const bottom = H - 15;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d')!;

  function rgb(color: string): [number, number, number] {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2]];
  }

  function text(
    value: string,
    x: number,
    y: number,
    width: number,
    size = 8,
    bold = false,
    color = '#333333',
  ) {
    if (width <= 0) return;
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...rgb(color));

    let label = value;

    if (pdf.getTextWidth(label) > width) {
      while (label.length && pdf.getTextWidth(label + '...') > width) {
        label = label.slice(0, -1);
      }
      label = label.length ? label + '...' : '';
    }

    if (label) pdf.text(label, x, y);
  }

  function rectangle(
    x: number, y: number, w: number, h: number,
    fill: string, border = '#dddddd',
  ) {
    pdf.setDrawColor(...rgb(border));
    pdf.setFillColor(...rgb(fill));
    pdf.setLineWidth(0.15);
    pdf.rect(x, y, w, h, 'FD');
  }

  let y = 0;
  let pageNumber = 0;

  function newPage(section: string) {
    if (pageNumber > 0) pdf.addPage();

    pageNumber += 1;

    text(options.title, margin, 15, W - 20, 17, true);
    text(section, margin, 23, W - 20, 12, true);

    text(
      `${format(days[0], 'dd MMM yyyy')} - ${format(days[days.length - 1], 'dd MMM yyyy')}`,
      margin, 30, W - 20, 9,
    );

    y = 35;

    rectangle(margin, y, sidebar, 16, '#f1f2f3');

    text(
      section.startsWith('1')
        ? 'Team / Resource'
        : 'Project',
      margin + 2, y + 10, sidebar - 4, 9, true,
    );

    let monthStart = 0;

    while (monthStart < days.length) {
      let monthEnd = monthStart + 1;

      while (
        monthEnd < days.length &&
        format(days[monthEnd], 'yyyy-MM') === format(days[monthStart], 'yyyy-MM')
      ) monthEnd++;

      const x = gridX + monthStart * dayWidth;
      const w = (monthEnd - monthStart) * dayWidth;

      rectangle(x, y, w, 8, '#f1f2f3', '#333333');

      text(
        format(days[monthStart], 'MMMM yyyy'),
        x + 2, y + 5.5, w - 4, 10, true,
      );

      monthStart = monthEnd;
    }

    days.forEach((date, i) => {
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const x = gridX + i * dayWidth;

      rectangle(x, y + 8, dayWidth, 8, weekend ? '#e6e6e6' : '#ffffff');

      text(
        format(date, 'd'),
        x + 0.7, y + 13, dayWidth - 1.4,
        days.length > 45 ? 5 : 7,
      );
    });

    y += 16;
  }

  function gridRow(height: number) {
    rectangle(margin, y, sidebar, height, '#ffffff');

    days.forEach((date, i) => {
      const weekend = date.getDay() === 0 || date.getDay() === 6;

      rectangle(
        gridX + i * dayWidth,
        y,
        dayWidth,
        height,
        weekend ? '#f0f0f0' : '#ffffff',
      );
    });
  }

  function teamHeading(name: string) {
    rectangle(margin, y, W - margin * 2, 8, '#D0D3D4');
    text(name, margin + 2, y + 5.5, W - 24, 10, true);
    y += 8;
  }

  function drawSection(rows: ExportRow[], section: string) {
    newPage(section);
    let lastTeam: string | undefined;

    for (const row of rows) {
      const bars = [
        ...row.tasks.map(task => ({
          startDate: task.startDate,
          endDate: task.endDate,
          task,
          leave: false as const,
        })),
        ...(row.timeOff ?? []).map(record => ({
          startDate: record.startDate,
          endDate: record.endDate,
          task: null,
          leave: true as const,
        })),
      ]
        .filter(bar =>
          bar.startDate <= options.endDate &&
          bar.endDate >= options.startDate,
        )
        .sort((a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          b.endDate.localeCompare(a.endDate),
        );

      if (bars.length === 0) {
        const height = 9;
        const headingHeight =
          row.team && row.team !== lastTeam ? 8 : 0;

        if (y + height + headingHeight > bottom) {
          newPage(section);
          lastTeam = undefined;
        }

        if (row.team && row.team !== lastTeam) {
          teamHeading(row.team);
          lastTeam = row.team;
        }

        gridRow(height);
        text(
          row.name,
          margin + 2, y + 5.8,
          sidebar - 4, 9, true,
        );

        y += height;
        continue;
      }

      const laneEnds: string[] = [];

      const positioned = bars.map(bar => {
        let lane = laneEnds.findIndex(end => end < bar.startDate);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = bar.endDate;
        return { ...bar, lane };
      });

      const maxLanes = Math.max(
        1, Math.floor((bottom - 65) / laneHeight),
      );

      for (
        let laneOffset = 0;
        laneOffset < laneEnds.length;
        laneOffset += maxLanes
      ) {
        const lanes = Math.min(maxLanes, laneEnds.length - laneOffset);
        const height = lanes * laneHeight + 3;
        const headingHeight = row.team && row.team !== lastTeam ? 8 : 0;

        if (y + height + headingHeight > bottom) {
          newPage(section);
          lastTeam = undefined;
        }

        if (row.team && row.team !== lastTeam) {
          teamHeading(row.team);
          lastTeam = row.team;
        }

        gridRow(height);

        text(
          row.name + (laneOffset ? ' (continued)' : ''),
          margin + 2, y + 6, sidebar - 4, 9, true,
        );

        positioned
          .filter(bar =>
            bar.lane >= laneOffset &&
            bar.lane < laneOffset + lanes,
          )
          .forEach(bar => {
            const first = keys.findIndex(k => k >= bar.startDate);
            let last = keys.findIndex(k => k > bar.endDate) - 1;
            if (last < 0) last = keys.length - 1;

            const x = gridX + Math.max(0, first) * dayWidth + 0.3;
            const width = Math.max(0.5, (last - Math.max(0, first) + 1) * dayWidth - 0.6);
            const top = y + 1.5 + (bar.lane - laneOffset) * laneHeight;

            if (bar.leave || !bar.task) {
              rectangle(x, top, width, laneHeight - 1, '#d9d9d9');
              text('Time off', x + 1, top + 5, width - 2, 8, true);
              return;
            }

            const task = bar.task;
            const project = task.projectId ? projectMap.get(task.projectId) : undefined;
            const colorId = row.assigneeId ?? task.assigneeIds[0];
            const resourceColor = colorId ? personColors.get(colorId) : undefined;

            const appearance = getTaskBarAppearance({
              fallbackProjectColor:
                options.projects.length === 1
                  ? options.projects[0]?.color
                  : undefined,
              priority: task.priority,
              projectColor: resourceColor ?? project?.color,
              status: statusMap.get(task.statusId),
            });

            rectangle(
              x, top, width, laneHeight - 1,
              appearance.backgroundColor,
              '#b0b0b0',
            );

            const names = task.assigneeIds
              .map(id => personMap.get(id)?.name ?? id)
              .join(', ');

            const sublabel = row.assigneeId
              ? project
                ? formatProjectLabel(project.name, project.code)
                : 'No project'
              : names || 'Unassigned';

            text(task.title, x + 1, top + 3.7, width - 2, 8, true);
            text(sublabel, x + 1, top + 7.3, width - 2, 7);
          });

        y += height;
      }
    }

  }

  function drawMilestones() {
    if (options.milestones.length) {
      const section = '3. Milestones';
      newPage(section);

      for (const milestone of [...options.milestones].sort(
        (a, b) => a.date.localeCompare(b.date)
      )) {
        const index = keys.indexOf(milestone.date);
        if (index < 0) continue;

        if (y + 7 > bottom) newPage(section);

        gridRow(7);

        const project = projectMap.get(milestone.projectId);
        text(project?.name ?? '', margin + 2, y + 4.5, sidebar - 4, 7);

        const x = gridX + (index + 0.5) * dayWidth;
        pdf.setFillColor(40, 40, 40);
        pdf.circle(x, y + 3.5, 1.1, 'F');

        text(
          milestone.title,
          x + 2, y + 4.5,
          W - margin - x - 3, 7,
        );

        y += 7;
      }
    }
  }

  drawSection(options.teamRows, '1. Team Allocation');
  drawSection(options.projectRows, '2. Project Overview');
  drawMilestones();

  const total = pdf.getNumberOfPages();

  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    text(
      `Generated ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
      margin, H - 7, 150, 7,
    );
    text(
      `Page ${page} of ${total}`,
      W - 35, H - 7, 25, 7,
    );
  }

  pdf.save(`Resource-Project-Allocation-${options.startDate}.pdf`);
}
