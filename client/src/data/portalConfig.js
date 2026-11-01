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
    sections: ['Overview', 'My timetable', 'Notes & resources', 'Class chat'],
    nextUp: { title: 'Mathematics · Chapter 5', detail: 'Algebra & equations · Today, 4:00 PM', progress: '75% completed' },
    quickAction: 'Keep your streak going.',
  },
  teacher: {
    label: 'Faculty Dashboard',
    role: 'Teacher',
    tone: 'red',
    title: 'Make every lesson count.',
    description: 'A focused workspace for attendance, marks, notes and your class timetable.',
    stats: [['24', 'Students'], ['06', 'Notes uploaded'], ['03', 'Classes today']],
    sections: ['Overview', 'Attendance', 'Publish results', 'Upload notes'],
    nextUp: { title: 'Class 10 · Mathematics', detail: '24 students · Attendance pending', progress: 'Open workspace' },
    quickAction: 'Ready to mark attendance?',
  },
  parent: {
    label: 'Parent Portal',
    role: 'Parent',
    tone: 'green',
    title: 'Stay close to their progress.',
    description: 'Follow attendance, results, fees and class updates for your child in one calm place.',
    stats: [['94%', 'Attendance'], ['82%', 'Last test'], ['00', 'Fees due']],
    sections: ['Overview', 'Attendance', 'Results', 'Fees & payments'],
    nextUp: { title: 'Science · Unit test 2', detail: 'Friday, 10:00 AM · Syllabus shared', progress: '80% syllabus covered' },
    quickAction: 'Message the class teacher',
  },
  admin: {
    label: 'Administration Center',
    role: 'Admin',
    tone: 'yellow',
    title: 'Keep the whole school moving.',
    description: 'Set up classes, add people and see what is happening across LearnAlaya.',
    sections: ['Overview', 'Users', 'Classes & subjects', 'Activity log'],
  },
}
