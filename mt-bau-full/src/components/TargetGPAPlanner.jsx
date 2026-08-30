import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './TargetGPAPlanner.css';

const TargetGPAPlanner = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [currentGPA, setCurrentGPA] = useState('');
  const [completedHours, setCompletedHours] = useState('');
  const [targetGPA, setTargetGPA] = useState('');
  const [semesterHours, setSemesterHours] = useState('15');

  const [result, setResult] = useState(null);

  const handleCalculate = (e) => {
    e.preventDefault();

    const cur = parseFloat(currentGPA);
    const hours = parseFloat(completedHours);
    const target = parseFloat(targetGPA);
    const semHours = parseFloat(semesterHours);

    if (isNaN(cur) || isNaN(hours) || isNaN(target) || isNaN(semHours) || hours <= 0 || semHours <= 0) {
      setResult({
        error: isAr ? 'يرجى إدخال قيم صحيح في جميع الحقول' : 'Please enter valid values in all fields'
      });
      return;
    }

    // Formula:
    // (cur * hours) + (requiredSemGPA * semHours) = target * (hours + semHours)
    // requiredSemGPA = [ target * (hours + semHours) - (cur * hours) ] / semHours

    const totalHours = hours + semHours;
    const requiredPointsTotal = target * totalHours;
    const currentPointsTotal = cur * hours;
    const neededSemPoints = requiredPointsTotal - currentPointsTotal;
    const requiredSemGPA = neededSemPoints / semHours;

    let status = 'achievable';
    let statusMsgAr = 'ممكن وبإمكانك تحقيقه بجهد مناسب!';
    let statusMsgEn = 'Achievable with dedicated effort!';
    let statusColor = '#10b981';

    if (requiredSemGPA > 4.0) {
      status = 'impossible';
      statusMsgAr = 'مستحيل في فصل واحد (يتطلب معدل أسرع من 4.00)! حاول تقليل المعدل المستهدف أو حساب أكثر من فصل.';
      statusMsgEn = 'Impossible in one term (>4.00 required). Try setting a lower target or spread over multiple terms.';
      statusColor = '#ef4444';
    } else if (requiredSemGPA >= 3.65) {
      status = 'hard';
      statusMsgAr = 'يتطلب تفوق حقيقي (معدل امتياز بهذا الفصل)';
      statusMsgEn = 'Requires excellence (Distinction this semester)';
      statusColor = '#f59e0b';
    } else if (requiredSemGPA < 2.0) {
      status = 'easy';
      statusMsgAr = 'سهل ومتاح جداً!';
      statusMsgEn = 'Very easy to achieve!';
      statusColor = '#3b82f6';
    }

    // Suggested Grade Distribution Recommendation
    let recommendationAr = '';
    let recommendationEn = '';
    if (requiredSemGPA >= 3.75) {
      recommendationAr = 'تحتاج الحصول على علامات A و A- في معظم المواد.';
      recommendationEn = 'You need mostly A and A- grades in your courses.';
    } else if (requiredSemGPA >= 3.25) {
      recommendationAr = 'تحتاج الحصول على علامات B+ و B على الأقل.';
      recommendationEn = 'You need B+ and B grades on average.';
    } else if (requiredSemGPA >= 2.5) {
      recommendationAr = 'تحتاج معدل C+ إلى B لرفع المعدل بنجاح.';
      recommendationEn = 'You need C+ to B average to raise your GPA.';
    } else {
      recommendationAr = 'المعدل المطلوب ميسر بجميع العلامات فوق المقبول.';
      recommendationEn = 'The required target is easily manageable with passing grades.';
    }

    setResult({
      requiredSemGPA: requiredSemGPA > 0 ? requiredSemGPA.toFixed(2) : '0.00',
      totalHours,
      status,
      statusMsgAr,
      statusMsgEn,
      statusColor,
      recommendationAr,
      recommendationEn
    });
  };

  return (
    <div className="target-planner-container">
      <div className="target-planner-header">
        <div className="header-icon">🎯</div>
        <div>
          <h3>{isAr ? 'مخطط ومحدد المعدل المستهدف' : 'Target GPA Planner'}</h3>
          <p>{isAr ? 'احسب المعدل الفصلي المطلوب منك في الفصل القادم للوصول لمعدلك التراكمي الحلم' : 'Calculate the semester GPA required to hit your target cumulative GPA'}</p>
        </div>
      </div>

      <form onSubmit={handleCalculate} className="target-planner-form">
        <div className="input-grid">
          <div className="planner-field">
            <label>{isAr ? 'المعدل التراكمي الحالي *' : 'Current Cumulative GPA *'}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="4.0"
              required
              placeholder="مثال: 2.75"
              value={currentGPA}
              onChange={(e) => setCurrentGPA(e.target.value)}
            />
          </div>

          <div className="planner-field">
            <label>{isAr ? 'الساعات المقطوع (المكتسب) *' : 'Completed Hours *'}</label>
            <input
              type="number"
              min="1"
              required
              placeholder="مثال: 45"
              value={completedHours}
              onChange={(e) => setCompletedHours(e.target.value)}
            />
          </div>

          <div className="planner-field">
            <label>{isAr ? 'المعدل التراكمي المستهدف 🎯 *' : 'Target Cumulative GPA *'}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="4.0"
              required
              placeholder="مثال: 3.00"
              value={targetGPA}
              onChange={(e) => setTargetGPA(e.target.value)}
            />
          </div>

          <div className="planner-field">
            <label>{isAr ? 'ساعات الفصل الحالي *' : 'Semester Hours *'}</label>
            <input
              type="number"
              min="1"
              max="24"
              required
              placeholder="مثال: 15"
              value={semesterHours}
              onChange={(e) => setSemesterHours(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" className="btn-calculate-target">
          🚀 {isAr ? 'حساب المعدل الفصلي المطلوب' : 'Calculate Required GPA'}
        </button>
      </form>

      {result && (
        <div className="planner-result-card animated-fade-in" style={{ borderColor: result.statusColor }}>
          {result.error ? (
            <p className="error-text">{result.error}</p>
          ) : (
            <div className="result-content">
              <div className="result-score-box">
                <span className="result-label">{isAr ? 'المعدل الفصلي المطلوب بالفصل الحالي' : 'Required Semester GPA'}</span>
                <span className="result-value" style={{ color: result.statusColor }}>
                  {result.requiredSemGPA}
                </span>
                <span className="result-status-badge" style={{ backgroundColor: result.statusColor }}>
                  {isAr ? result.statusMsgAr : result.statusMsgEn}
                </span>
              </div>

              <div className="result-advice">
                <h4>💡 {isAr ? 'نصيح وط الحصول عليها:' : 'Strategy Recommendation:'}</h4>
                <p>{isAr ? result.recommendationAr : result.recommendationEn}</p>
                <small>
                  {isAr
                    ? `إجمالي الساعات الكلي بعد نهاي الفصل ستكون: ${result.totalHours} ساع.`
                    : `Total cumulative hours after this semester will be: ${result.totalHours} hrs.`}
                </small>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TargetGPAPlanner;
