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
    stats: [['92%', 'Attendance'], ['86%', 'Average score'], ['04', 'Notes saved']],
    sections: ['Overview', 'My timetable', 'Notes & resources', 'Class chat', 'Announcements'],
    nextUp: { title: 'Mathematics · Chapter 5', detail: 'Algebra & equations · Today, 4:00 PM', progress: '75% completed' },
    quickAction: 'Keep your streak going.',
  },
  teacher: {
    label: 'Faculty Dashboard',
    role: 'Teacher',
    tone: 'red',
    title: 'Make every lesson count.',
    description: 'A focused workspace for attendance, marks, notes and your class timetable.',
    sections: ['Overview', 'Timetable', 'Attendance', 'Announcements', 'Publish results', 'Upload notes'],
  },
  parent: {
    label: 'Parent Portal',
    role: 'Parent',
    tone: 'green',
    title: 'Stay close to their progress.',
    description: 'Follow your child’s timetable, attendance, fees and school announcements in one calm place.',
    sections: ['Overview', 'Timetable', 'Attendance', 'Fees', 'Announcements'],
  },
  admin: {
    label: 'Administration Center',
    role: 'Admin',
    tone: 'yellow',
    title: 'Keep the whole school moving.',
    description: 'Set up classes, add people and see what is happening across LearnAlaya.',
    sections: ['Overview', 'Users', 'Classes & subjects', 'Timetable', 'Fees', 'Announcements', 'Activity log'],
  },
}
