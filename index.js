const express = require('express');
const app = express();
const path = require('path');
const multer = require('multer');
const mysql = require('mysql2');
const fs = require('fs');
const nunjucks = require('nunjucks');

nunjucks.configure('chart', {
  autoescape: true,
  express: app,
});

// MySQL connection 설정
const connection = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: '비밀번호',
  database: '디비이름',
});

//uploads 폴더 생성
try {
  fs.readdirSync('uploads');
} catch (error) {
  console.error('uploads 폴더가 없어 uploads 폴더를 생성합니다.');
  fs.mkdirSync('uploads');
}

// 파일 업로드를위한 multer 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, path.basename(file.originalname, ext) + Date.now() + ext);
  },
});
const upload = multer({ storage: storage });

//db에서 값꺼낸거 정리 하고 담을 배열선언
const coretask_value = Array.from(
  {
    length: 5,
  },
  () =>
    Array.from(
      {
        length: 5,
      },
      () => []
    )
); //task별로 정렬시키기 : taskN에 속한 coreN의 값의 집합

//꺼낸 값들 계산 하고 담을 배열 선언
const coretask_result = Array.from(
  {
    length: 5,
  },
  () =>
    Array.from(
      {
        length: 5,
      },
      () => []
    )
); //task별, core별로 최대, 최소, 평균, 표준편차, 중앙값 계산

// 업로드 페이지를 렌더링하는 라우터
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload.html'));
});

// 서버 시작
app.listen(3000, () => {
  console.log('서버가 시작되었습니다.');
});

//서버 종료와 함께 db연결 종료
process.on('SIGINT', () => {
  console.log('서버가 종료됩니다.');
  connection.end();
  process.exit();
});

// 업로드된 파일을 처리하는 라우터 파일로 들어온 데이터 가공하고 DB에 저장
app.post('/upload', upload.single('userfile'), (req, res) => {
  // 새로운 파일을 위해 기존 기록 제거
  connection.query('DELETE FROM table_name');

  // 파일이 위치한 디렉토리 경로
  const directoryPath = 'uploads/';

  // 파일 이름 목록 읽기
  const files = fs.readdirSync(directoryPath);
  const fileName = files[0];

  const fileContent = fs.readFileSync(directoryPath + fileName, 'utf-8');

  // 숫자 값만 받아오는 코드
  const frows = fileContent.match(/\d+/g);

  // core1 <-에 붙은 숫자 제거
  const rows = frows.filter(
    (value) => !['1', '2', '3', '4', '5'].includes(value)
  );

  // rows를 2차원 배열로 변환
  const numColumns = 5;
  const data = [];
  for (let i = 0; i < rows.length; i += numColumns) {
    const row = rows.slice(i, i + numColumns);
    data.push(row);
  }

  //사용한 파일 다시 제거
  fs.unlink(directoryPath + fileName, (err) => {
    if (err) throw err;
    console.log('File is deleted.');
  });

  // 삽입 쿼리 생성
  connection.query(
    'INSERT INTO table_name (task1, task2, task3, task4, task5) VALUES ?',
    [data],
    (err) => {
      if (err) throw err;
      console.log(`Inserted ${data.length} rows.`);
    }
  );

  // 데이터베이스에서 데이터 가져오기
  connection.query(
    'SELECT task1, task2, task3, task4, task5 FROM table_name',
    (error, results, fields) => {
      if (error) throw error;

      // 데이터를 저장할 이차원 배열
      const data = [];

      // 결과를 배열에 저장
      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const rowData = [row.task1, row.task2, row.task3, row.task4, row.task5];
        data.push(rowData);
      }

      // 이차원 배열인 data를 일차원 배열로 복사
      const newdata = data.flat();

      // 각 task마다 core1~5까지의 값 묶어서 넣기 이 부분 너무
      // 어려움!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
      for (let j = 0; j < 10; j++) {
        const realnew_data = newdata.slice(j * 25, j * 25 + 25);
        for (let i = 0; i < 25; i++) {
          const coreIndex = parseInt(i / 5);
          const valueIndex = i % 5;
          coretask_value[coreIndex][valueIndex].push(realnew_data[i]);
        }
      }

      // coretask_result 값 넣기
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          const values = coretask_value[i][j];
          const max = Math.max(...values);
          const min = Math.min(...values);
          const average = avg(values);
          const stdDeviation = standardDeviation(values);
          const medianValue = median(values);
          coretask_result[i][j].push(
            max,
            min,
            average,
            stdDeviation,
            medianValue
          );
        }
      }

      // 평균 계산 함수
      function avg(arr) {
        const sum = arr.reduce((total, num) => total + parseInt(num), 0);
        return Math.floor(sum / arr.length);
      }

      // 표준 편차 계산 함수
      function standardDeviation(arr) {
        const mean = avg(arr);
        const squaredDiffs = arr.map((num) => (parseInt(num) - mean) ** 2);
        const variance =
          squaredDiffs.reduce((total, num) => total + num, 0) /
          (arr.length - 1);
        return Math.floor(Math.sqrt(variance));
      }

      // 중앙값 계산 함수
      function median(arr) {
        const sortedArr = arr.map((num) => parseInt(num)).sort((a, b) => a - b);
        const midIndex = Math.floor(sortedArr.length / 2);
        return sortedArr[midIndex];
      }

      console.log(coretask_value); // taskN에 속한 coreN의 값의 집합 출력
      console.log(coretask_result); //task별, core별로 최대, 최소, 평균, 표준편차, 중앙값 계산한 배열 출력

      res.render('main.html', { coretask_result });
    }
  );
});
