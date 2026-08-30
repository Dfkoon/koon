import libraryBookAuthor from '../assets/quizzes/databases/library_book_author.png';

export const extraQuizData = {
    databases_past_years: {
        id: 'databases_past_years',
        title: 'Databases - Past Year Questions',
        titleAr: 'قواعد بيانات - أسئلة سنوات',
        icon: '🗄️',
        color: '#4CAF50',
        questions: [
            {
                id: 'db1',
                type: 'mcq',
                questionEn: 'What is the primary key of the relation Review?',
                options: [
                    { id: 'a', textEn: 'text' },
                    { id: 'b', textEn: 'email, text' },
                    { id: 'c', textEn: 'text, date, rating' },
                    { id: 'd', textEn: 'email, reputation, text' }
                ],
                correctAnswer: 'c',
                marks: 1.0
            },
            {
                id: 'db2',
                type: 'mcq',
                questionEn: 'What is the correct query to display the maximum salary in each department?<br><pre><code class="language-sql">SELECT department_id, MAX(salary)\nFROM employees\nGROUP BY department_id</code></pre>',
                options: [
                    { id: 'a', textEn: 'SELECT department_id, MAX(*) FROM employees GROUP BY department_id' },
                    { id: 'b', textEn: 'SELECT department_id, MAXIMUM(salary) FROM employees GROUP BY department_id' },
                    { id: 'c', textEn: 'SELECT department_id, MAX(salary) FROM employees GROUP BY department_id' },
                    { id: 'd', textEn: 'SELECT department_id, MAX(salary) FROM employees ORDER BY department_id' }
                ],
                correctAnswer: 'c',
                marks: 1.0
            },
            {
                id: 'db3',
                type: 'mcq',
                questionEn: 'Which of the following statements is TRUE?',
                options: [
                    { id: 'a', textEn: 'Every employee is assigned to more than one automobile' },
                    { id: 'b', textEn: 'May be employee has a reference' },
                    { id: 'c', textEn: 'Every automobile is assigned to an employee' },
                    { id: 'd', textEn: 'A reference may or may not belong to an employee' }
                ],
                correctAnswer: 'd',
                marks: 1.0
            },
            {
                id: 'db4',
                type: 'mcq',
                questionEn: 'Which of the following relational schemas is correct when mapping the USE relationship?',
                options: [
                    { id: 'a', textEn: 'USE(number, id, hours)' },
                    { id: 'b', textEn: 'USE(employee.id, machinery.id, hours)' },
                    { id: 'c', textEn: 'USE(employee.id, number, hours)' },
                    { id: 'd', textEn: 'USE(number, employee.id, machinery.id, hours)' }
                ],
                correctAnswer: 'd',
                marks: 1.0
            },
            {
                id: 'db5',
                type: 'mcq',
                questionEn: 'Which of the following relations is the correct relational schema when mapping entity B in the E-R model?',
                options: [
                    { id: 'a', textEn: 'B(s1, b1, x, y)' },
                    { id: 'b', textEn: 'B(s1, b1)' },
                    { id: 'c', textEn: 'B(s1, s2, b1, b2, x, y, c2)' },
                    { id: 'd', textEn: 'B(s1, s2, b1, x, y)' }
                ],
                correctAnswer: 'b',
                marks: 1.0
            },
            {
                id: 'db6',
                type: 'mcq',
                questionEn: 'Which min-max notation is consistent with the relationship between Library book and Author?',
                image: libraryBookAuthor,
                options: [
                    { id: 'a', textEn: '(1..*), (0..*)' },
                    { id: 'b', textEn: '(1..*), (1..*)' },
                    { id: 'c', textEn: '(1..*), (1..1)' },
                    { id: 'd', textEn: '(0..*), (0..*)' },
                    { id: 'e', textEn: '(0..*), (1..*)' }
                ],
                correctAnswer: 'b',
                marks: 1.0
            }
        ]
    }
};
