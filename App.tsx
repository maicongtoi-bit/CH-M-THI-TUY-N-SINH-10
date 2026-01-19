import React, { useState, useRef, useEffect } from 'react';
import { AppStep, UploadState, FileWithPreview, GradingResult, StudentSubmission } from './types';
import { gradeStudentWork } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Declare html2pdf for TypeScript
declare global {
  interface Window {
    html2pdf: any;
  }
}

function App() {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [uploadState, setUploadState] = useState<UploadState>({
    examAndKey: [],
    students: [],
  });
  
  // UI State for Result View
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Initialize with one empty student if empty
  useEffect(() => {
    if (step === AppStep.UPLOAD && uploadState.students.length === 0) {
      addStudent();
    }
  }, [step]);

  // --- Helpers ---
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const processFiles = (files: File[]): FileWithPreview[] => {
    return files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      type: file.type.includes('pdf') ? 'pdf' : 'image'
    }));
  };

  // --- Handlers: Exam & Key ---
  const handleExamKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = processFiles(Array.from(e.target.files));
      setUploadState(prev => ({
        ...prev,
        examAndKey: [...prev.examAndKey, ...newFiles]
      }));
    }
  };

  const removeExamKeyFile = (index: number) => {
    setUploadState(prev => {
      const newFiles = [...prev.examAndKey];
      newFiles.splice(index, 1);
      return { ...prev, examAndKey: newFiles };
    });
  };

  // --- Handlers: Students ---
  const addStudent = () => {
    setUploadState(prev => ({
      ...prev,
      students: [
        ...prev.students,
        {
          id: generateId(),
          name: `Học sinh ${prev.students.length + 1}`,
          files: [],
          status: 'idle'
        }
      ]
    }));
  };

  const removeStudent = (id: string) => {
    setUploadState(prev => ({
      ...prev,
      students: prev.students.filter(s => s.id !== id)
    }));
  };

  const updateStudentName = (id: string, name: string) => {
    setUploadState(prev => ({
      ...prev,
      students: prev.students.map(s => s.id === id ? { ...s, name } : s)
    }));
  };

  const handleStudentFilesChange = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = processFiles(Array.from(e.target.files));
      setUploadState(prev => ({
        ...prev,
        students: prev.students.map(s => s.id === id ? { ...s, files: [...s.files, ...newFiles] } : s)
      }));
    }
  };

  const removeStudentFile = (studentId: string, fileIndex: number) => {
    setUploadState(prev => ({
      ...prev,
      students: prev.students.map(s => {
        if (s.id === studentId) {
          const newFiles = [...s.files];
          newFiles.splice(fileIndex, 1);
          return { ...s, files: newFiles };
        }
        return s;
      })
    }));
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files: File[] = Array.from(e.target.files);
      const newStudents: StudentSubmission[] = [];
      let currentCount = uploadState.students.length;

      files.forEach(file => {
        if (file.type.includes('pdf')) {
          currentCount++;
          newStudents.push({
            id: generateId(),
            name: file.name.replace('.pdf', ''),
            files: processFiles([file]),
            status: 'idle'
          });
        }
      });

      if (newStudents.length > 0) {
        setUploadState(prev => ({
          ...prev,
          students: [...prev.students.filter(s => s.files.length > 0), ...newStudents] // Keep existing valid ones, append new
        }));
      } else {
        alert("Chức năng tải hàng loạt chỉ hỗ trợ file PDF (mỗi file là 1 học sinh).");
      }
    }
  };

  // --- Grading Logic ---
  const startGrading = async () => {
    const validStudents = uploadState.students.filter(s => s.files.length > 0);
    if (uploadState.examAndKey.length === 0 || validStudents.length === 0) {
      alert("Vui lòng tải lên Đề/Đáp án và ít nhất một bài làm học sinh.");
      return;
    }

    setStep(AppStep.PROCESSING);
    
    // Process sequentially to be safe with rate limits and progress tracking
    const studentsToGrade = [...validStudents]; // Copy array
    
    // We update the state to match the filtered valid list + reset statuses
    setUploadState(prev => ({
      ...prev,
      students: studentsToGrade.map(s => ({ ...s, status: 'idle', result: undefined, error: undefined }))
    }));

    for (let i = 0; i < studentsToGrade.length; i++) {
      const student = studentsToGrade[i];
      
      // Update status to processing
      updateStudentStatus(student.id, 'processing');

      try {
        const result = await gradeStudentWork(uploadState.examAndKey, student.files);
        updateStudentResult(student.id, result);
      } catch (error: any) {
        console.error(`Error grading student ${student.id}:`, error);
        updateStudentError(student.id, error.message || "Lỗi chấm bài");
      }
    }

    setStep(AppStep.RESULT);
    if (studentsToGrade.length > 0) {
      setSelectedStudentId(studentsToGrade[0].id);
    }
  };

  const updateStudentStatus = (id: string, status: StudentSubmission['status']) => {
    setUploadState(prev => ({
      ...prev,
      students: prev.students.map(s => s.id === id ? { ...s, status } : s)
    }));
  };

  const updateStudentResult = (id: string, result: GradingResult) => {
    setUploadState(prev => ({
      ...prev,
      students: prev.students.map(s => s.id === id ? { ...s, status: 'done', result } : s)
    }));
  };

  const updateStudentError = (id: string, error: string) => {
    setUploadState(prev => ({
      ...prev,
      students: prev.students.map(s => s.id === id ? { ...s, status: 'error', error } : s)
    }));
  };

  // --- Export ---
  const downloadJSON = (student: StudentSubmission) => {
    if (!student.result?.jsonData) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(student.result.jsonData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `ket_qua_${student.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const downloadPDF = (elementId: string, filename: string) => {
    if (!window.html2pdf) {
      alert("Thư viện xuất PDF chưa tải xong.");
      return;
    }
    const element = document.getElementById(elementId);
    if (!element) return;

    setIsExporting(true);
    
    // Configure html2pdf with specific settings for math/KaTeX
    const opt = {
      margin: [10, 10, 10, 10], 
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 1 }, // Max quality
      html2canvas: { 
        scale: 2, // Higher scale for clearer text/math
        useCORS: true, 
        scrollY: 0,
        // Crucial: Ignore MathML elements to prevent double rendering artifacts in PDF
        ignoreElements: (element: Element) => {
            return element.classList.contains('katex-mathml');
        }
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    window.html2pdf().set(opt).from(element).save().then(() => {
      setIsExporting(false);
    }).catch((err: any) => {
      console.error(err);
      setIsExporting(false);
      alert("Có lỗi khi xuất PDF.");
    });
  };

  const resetApp = () => {
    setStep(AppStep.UPLOAD);
    setUploadState({ examAndKey: [], students: [] });
    setSelectedStudentId(null);
  };

  // --- Render Components ---

  return (
    <div className="d-flex flex-column min-vh-100">
      {/* Header */}
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top shadow-sm" style={{zIndex: 1020}}>
        <div className="container-fluid px-4">
          <a className="navbar-brand d-flex align-items-center gap-2" href="#">
            <span className="bg-primary text-white rounded p-2 d-flex align-items-center justify-content-center" style={{width: '40px', height: '40px'}}>
              <i className="fa-solid fa-graduation-cap fa-lg"></i>
            </span>
            <span className="fw-bold text-primary">MathStepGrader AI</span>
          </a>
          
          <div className="d-flex align-items-center gap-3">
             {step === AppStep.PROCESSING && (
                <span className="badge bg-warning text-dark animate-pulse">
                  <i className="fa-solid fa-spinner fa-spin me-1"></i> Đang chấm {uploadState.students.filter(s => s.status === 'done').length}/{uploadState.students.length}
                </span>
             )}
             {step !== AppStep.UPLOAD && (
                <button onClick={resetApp} className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-2">
                  <i className="fa-solid fa-rotate-right"></i> Chấm Mới
                </button>
              )}
          </div>
        </div>
      </nav>

      <main className="flex-grow-1 bg-light">
        
        {/* Step 1: Upload */}
        {step === AppStep.UPLOAD && (
          <div className="container py-5 fade-in">
            <div className="text-center mb-5">
              <h2 className="display-6 fw-bold text-dark mb-3">Chấm Nhiều Bài Thi Cùng Lúc</h2>
              <p className="lead text-secondary">
                Tải lên đề & đáp án một lần, sau đó thêm danh sách bài làm của học sinh để chấm hàng loạt.
              </p>
            </div>

            <div className="row g-4">
              {/* Left Column: Exam & Key */}
              <div className="col-lg-4">
                <div className="card shadow-sm border-0 h-100">
                  <div className="card-header bg-white fw-bold py-3 text-primary border-bottom-0">
                    <i className="fa-solid fa-file-invoice me-2"></i> 1. Đề & Đáp Án
                  </div>
                  <div className="card-body">
                    <UploadArea 
                      files={uploadState.examAndKey}
                      onUpload={handleExamKeyChange}
                      onRemove={removeExamKeyFile}
                      label="Tải lên Đề thi & Đáp án"
                      accept="image/*,application/pdf"
                    />
                    <div className="mt-3 text-muted small">
                      <i className="fa-solid fa-circle-info me-1"></i>
                      Hệ thống sẽ dùng bộ đề này để chấm cho tất cả học sinh bên phải.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Students */}
              <div className="col-lg-8">
                 <div className="card shadow-sm border-0 h-100">
                    <div className="card-header bg-white fw-bold py-3 text-primary d-flex justify-content-between align-items-center border-bottom-0">
                      <span><i className="fa-solid fa-users me-2"></i> 2. Danh Sách Học Sinh ({uploadState.students.length})</span>
                      <div className="d-flex gap-2">
                         <label className="btn btn-outline-primary btn-sm" title="Mỗi file PDF sẽ được tạo thành 1 học sinh">
                            <i className="fa-solid fa-file-pdf me-1"></i> Thêm Hàng Loạt (PDF)
                            <input type="file" className="d-none" multiple accept="application/pdf" onChange={handleBulkUpload} />
                         </label>
                         <button className="btn btn-primary btn-sm" onClick={addStudent}>
                            <i className="fa-solid fa-plus me-1"></i> Thêm Thủ Công
                         </button>
                      </div>
                    </div>
                    <div className="card-body bg-light p-3" style={{maxHeight: '70vh', overflowY: 'auto'}}>
                        {uploadState.students.map((student, index) => (
                           <StudentCard 
                              key={student.id}
                              student={student}
                              index={index}
                              onRemove={() => removeStudent(student.id)}
                              onNameChange={(val) => updateStudentName(student.id, val)}
                              onFilesChange={(e) => handleStudentFilesChange(student.id, e)}
                              onRemoveFile={(fileIdx) => removeStudentFile(student.id, fileIdx)}
                           />
                        ))}
                    </div>
                    <div className="card-footer bg-white py-3 text-center">
                       <button 
                          onClick={startGrading}
                          disabled={uploadState.examAndKey.length === 0 || uploadState.students.filter(s => s.files.length > 0).length === 0}
                          className="btn btn-success btn-lg px-5 rounded-pill fw-bold shadow-sm"
                        >
                          <i className="fa-solid fa-play me-2"></i> Bắt Đầu Chấm {uploadState.students.filter(s => s.files.length > 0).length} Bài
                       </button>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 & 3: Processing & Result (Unified View) */}
        {(step === AppStep.PROCESSING || step === AppStep.RESULT) && (
           <div className="d-flex h-100" style={{height: 'calc(100vh - 70px)'}}>
              {/* Sidebar List */}
              <div className="bg-white border-end d-flex flex-column" style={{width: '350px', minWidth: '300px'}}>
                 <div className="p-3 border-bottom bg-light fw-bold text-secondary text-uppercase small">
                    Danh sách học sinh
                 </div>
                 <div className="flex-grow-1 overflow-auto">
                    <ul className="list-group list-group-flush">
                       {uploadState.students.map(s => (
                          <li 
                            key={s.id} 
                            className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3 cursor-pointer ${selectedStudentId === s.id ? 'bg-primary bg-opacity-10 border-start border-4 border-primary' : ''}`}
                            onClick={() => s.result && setSelectedStudentId(s.id)}
                            style={{cursor: s.result ? 'pointer' : 'default'}}
                          >
                             <div className="text-truncate me-2">
                                <div className="fw-bold text-dark">{s.name}</div>
                                <div className="small text-muted text-truncate">
                                   {s.files.length} file &bull; {s.files.map(f => f.file.name).join(', ')}
                                </div>
                             </div>
                             <div>
                                {s.status === 'idle' && <i className="fa-regular fa-circle text-muted"></i>}
                                {s.status === 'processing' && <div className="spinner-border spinner-border-sm text-primary"></div>}
                                {s.status === 'done' && (
                                   <span className="badge bg-success rounded-pill">
                                      {s.result?.jsonData?.scores?.total ?? '?'}đ
                                   </span>
                                )}
                                {s.status === 'error' && <i className="fa-solid fa-triangle-exclamation text-danger"></i>}
                             </div>
                          </li>
                       ))}
                    </ul>
                 </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-grow-1 bg-secondary bg-opacity-10 d-flex flex-column h-100 overflow-hidden">
                 {selectedStudentId ? (
                    (() => {
                       const student = uploadState.students.find(s => s.id === selectedStudentId);
                       if (!student || !student.result) return <div className="m-auto text-muted">Chọn học sinh để xem kết quả</div>;
                       
                       return (
                          <div className="d-flex flex-column h-100">
                             {/* Toolbar */}
                             <div className="bg-white border-bottom px-4 py-2 d-flex justify-content-between align-items-center shadow-sm">
                                <h5 className="m-0 fw-bold text-primary">{student.name}</h5>
                                <div className="d-flex gap-2">
                                   <button 
                                      onClick={() => downloadJSON(student)}
                                      className="btn btn-outline-secondary btn-sm"
                                      disabled={isExporting}
                                   >
                                      <i className="fa-solid fa-code me-1"></i> JSON
                                   </button>
                                   <button 
                                      onClick={() => downloadPDF(`report-${student.id}`, `PhieuCham_${student.name}`)}
                                      className="btn btn-primary btn-sm"
                                      disabled={isExporting}
                                   >
                                      {isExporting ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-file-pdf me-1"></i>}
                                      Xuất PDF
                                   </button>
                                </div>
                             </div>
                             
                             {/* Scrollable Report */}
                             <div className="flex-grow-1 overflow-auto p-4">
                                <div className="container" style={{maxWidth: '900px'}}>
                                   <div id={`report-${student.id}`} className="card shadow border-0 mb-5">
                                      <div className="card-body p-5">
                                         {/* Report Header for PDF */}
                                         <div className="print-only mb-4 border-bottom border-2 border-primary pb-3">
                                            <div className="row align-items-end">
                                               <div className="col-8">
                                                  <h1 className="h2 fw-bold text-dark m-0">PHIẾU CHẤM ĐIỂM</h1>
                                                  <p className="text-muted small m-0">Hệ thống MathStepGrader AI</p>
                                               </div>
                                               <div className="col-4 text-end">
                                                  <div className="text-muted small">Học sinh: <strong>{student.name}</strong></div>
                                                  <div className="text-muted small">Ngày: {new Date().toLocaleDateString('vi-VN')}</div>
                                               </div>
                                            </div>
                                         </div>

                                         <div className="markdown-content">
                                             <ReactMarkdown 
                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                rehypePlugins={[[rehypeKatex, { strict: false }]]}
                                                components={{
                                                   table: ({node, ...props}) => (
                                                      <div className="table-responsive my-4">
                                                         <table className="table table-bordered table-striped table-hover table-report" {...props} />
                                                      </div>
                                                   ),
                                                }}
                                             >
                                                {student.result.markdownReport}
                                             </ReactMarkdown>
                                         </div>
                                         
                                         {/* Footer for PDF */}
                                         <div className="print-only mt-5 pt-3 border-top text-center text-muted small">
                                            <p>Kết quả được chấm tự động bởi MathStepGrader AI.</p>
                                         </div>
                                      </div>
                                   </div>
                                </div>
                             </div>
                          </div>
                       );
                    })()
                 ) : (
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                       {step === AppStep.PROCESSING ? (
                          <>
                            <div className="spinner-border text-primary mb-3" style={{width: '3rem', height: '3rem'}}></div>
                            <h5>Đang xử lý danh sách...</h5>
                            <p>Vui lòng đợi trong giây lát.</p>
                          </>
                       ) : (
                          <>
                             <i className="fa-regular fa-file-lines fa-3x mb-3 opacity-50"></i>
                             <h5>Chọn một học sinh từ danh sách</h5>
                             <p>Kết quả chi tiết sẽ hiển thị tại đây.</p>
                          </>
                       )}
                    </div>
                 )}
              </div>
           </div>
        )}

      </main>
    </div>
  );
}

// --- Sub-components ---

const UploadArea: React.FC<{
  files: FileWithPreview[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  label: string;
  accept: string;
  multiple?: boolean;
}> = ({ files, onUpload, onRemove, label, accept, multiple = true }) => {
  return (
    <div>
       <div className="d-flex flex-column gap-2 mb-2">
          {files.map((f, i) => (
             <div key={i} className="d-flex align-items-center bg-white border rounded p-2 shadow-sm">
                <div className="me-2 text-danger"><i className="fa-solid fa-file-pdf"></i></div>
                <div className="text-truncate flex-grow-1 small fw-bold">{f.file.name}</div>
                <button onClick={() => onRemove(i)} className="btn btn-link text-danger p-0 ms-2"><i className="fa-solid fa-times"></i></button>
             </div>
          ))}
       </div>
       <label className="upload-area d-flex flex-column align-items-center justify-content-center p-4 w-100 text-center">
          <i className="fa-solid fa-cloud-arrow-up text-primary fa-2x mb-2"></i>
          <span className="fw-bold text-primary small">{label}</span>
          <input type="file" className="d-none" onChange={onUpload} accept={accept} multiple={multiple} />
       </label>
    </div>
  );
};

const StudentCard: React.FC<{
   student: StudentSubmission;
   index: number;
   onRemove: () => void;
   onNameChange: (val: string) => void;
   onFilesChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
   onRemoveFile: (idx: number) => void;
}> = ({ student, index, onRemove, onNameChange, onFilesChange, onRemoveFile }) => {
   return (
      <div className="card mb-3 border">
         <div className="card-body p-3">
            <div className="d-flex justify-content-between align-items-start mb-2">
               <div className="input-group input-group-sm" style={{maxWidth: '250px'}}>
                  <span className="input-group-text bg-light border-end-0"><i className="fa-solid fa-user"></i></span>
                  <input 
                     type="text" 
                     className="form-control border-start-0" 
                     value={student.name} 
                     onChange={(e) => onNameChange(e.target.value)}
                     placeholder="Tên học sinh"
                  />
               </div>
               <button onClick={onRemove} className="btn btn-outline-danger btn-sm border-0" title="Xóa học sinh này">
                  <i className="fa-solid fa-trash-can"></i>
               </button>
            </div>
            
            {/* Files */}
            <div className="bg-white rounded border p-2 mb-2">
               {student.files.length === 0 ? (
                  <div className="text-muted small text-center fst-italic py-2">Chưa có bài làm</div>
               ) : (
                  <div className="d-flex flex-wrap gap-2">
                     {student.files.map((f, idx) => (
                        <div key={idx} className="badge bg-light text-dark border d-flex align-items-center gap-2">
                           <span className="text-truncate" style={{maxWidth: '150px'}}>{f.file.name}</span>
                           <i className="fa-solid fa-times cursor-pointer text-danger" onClick={() => onRemoveFile(idx)}></i>
                        </div>
                     ))}
                  </div>
               )}
            </div>
            
            <div className="text-end">
               <label className="btn btn-light btn-sm text-primary fw-bold border" style={{fontSize: '0.8rem'}}>
                  <i className="fa-solid fa-plus me-1"></i> Thêm trang bài làm
                  <input type="file" className="d-none" multiple accept="image/*,application/pdf" onChange={onFilesChange} />
               </label>
            </div>
         </div>
      </div>
   );
};

export default App;