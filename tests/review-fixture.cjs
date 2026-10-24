// Fictional, deterministic content for controlled model transports only.
module.exports=function reviewFixture(answer){
 const quote=answer.slice(0,Math.min(16,answer.length));
 return {version:'2026-10-24.answer-review.v1',summary:'回答说明了参与方向，但缺少具体场景和验证依据。面试官还无法确认个人贡献。',annotations:[{quote,reason:'表述比较笼统，需要区分个人行动和团队工作。',rewrite:'我具体负责【待补充：自己承担的工作】，通过【待补充：核对方法】确认结果。'}],missingFacts:[{question:'选择哪个项目？你具体采取了什么行动，如何核对结果？',reason:'帮助面试官判断你的贡献，不能仅凭岗位名称推断能力。'}],referenceAnswer:'我的经历是：'+quote+'。在【待补充：具体项目】中，我负责【待补充：个人行动】，最终通过【待补充：验证方法与真实结果】确认交付。',referenceEvidence:[{claim:quote,quote}]};
};
