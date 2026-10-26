// UI entry and persisted active-state helpers for the multi-resume workflow.
async function enterResume(page,name='测试岗位简历'){
 if(await page.locator('#resumeEditorShell').isVisible())return;
 const cards=page.locator('[data-resume-open]');if(await cards.count()){const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('zm_resume_library_v1')).activeId);return page.locator('[data-resume-open="'+id+'"]').click();}
 await page.locator('#resumeLibraryNew').click();await page.locator('#resumeSettingName').fill(name);await page.locator('#resumeSettingsSave').click();
}
const activeResume=page=>page.evaluate(()=>{const library=JSON.parse(localStorage.getItem('zm_resume_library_v1'));return library.resumes.find(r=>r.id===library.activeId).state;});
module.exports={enterResume,activeResume};
