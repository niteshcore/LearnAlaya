export const portalRoles = ['student', 'teacher', 'parent', 'admin']

export const loginPaths = {
  student: '/login/student',
  teacher: '/login/teacher',
  parent: '/login/parent',
  admin: '/admin-login',
}

export const portalConfig = {
  student: {
    label: 'Student Portal',
    role: 'Student',
    tone: 'green',
    title: 'Your learning, all in one place.',
    description: 'Check your progress, find your notes and stay ready for what is next.',
    sections: ['Overview', 'Timetable', 'Attendance', 'Results', 'Notes', 'Class chat', 'Leave', 'Announcements'],
  },
  teacher: {
    label: 'Faculty Dashboard',
    role: 'Teacher',
    tone: 'red',
    title: 'Make every lesson count.',
    description: 'A focused workspace for attendance, marks, notes and your class timetable.',
    sections: ['Overview', 'Timetable', 'Attendance', 'Results', 'Notes', 'Class chat', 'Leave', 'Announcements'],
  },
  parent: {
    label: 'Parent Portal',
    role: 'Parent',
    tone: 'green',
    title: 'Stay close to their progress.',
    description: 'Follow your child’s timetable, attendance, results, fees and leave in one calm place.',
    sections: ['Overview', 'Timetable', 'Attendance', 'Results', 'Fees', 'Leave', 'Announcements'],
  },
  admin: {
    label: 'Administration Center',
    role: 'Admin',
    tone: 'yellow',
    title: 'Keep the whole school moving.',
    description: 'Set up classes, add people and see what is happening across LearnAlaya.',
    sections: ['Overview', 'Users', 'Classes & subjects', 'Timetable', 'Fees', 'Leave', 'Announcements', 'Activity log'],
  },
}
